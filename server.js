const util = require("util");
var path = require("path");
var fs = require("fs");
const { v4 } = require("uuid");
const http = require("http");
const { WebSocketServer } = require("ws");
var EventEmitter = require("events").EventEmitter;
const { exec, spawn } = require("child_process");
const ModbusHelper = require("./app/modbushelper.js");
const UnipiHelper = require("./app/unipihelper.js");

const server = http.createServer();
const wsServer = new WebSocketServer({ server });

//Modbus
const DEVICE_ID = 0;
const UNIPI_IP_LOCAL = "127.0.0.1";
const UNIPI_MODBUS_PORT = 502;

const WS_PORT = 8007; //Socket

const testLoop = process.env.TEST || "false";
const MINIMALDIM = process.env.MINIMALDIM || 0;

var debug = process.env.DEBUG == "true" ? true : false;
const clients = {};
var wsConnection;
var dimmerLoopTimer = undefined;
var dimmerLoopDebugTimer = undefined;
var dimmerTestLoopTimer = undefined;

var loopInfo = {
  running: false,
  runningTest: false,
  loopTimeMs: 0,
};

var runtimeData = {
  appVersion: 0,
  ip: "",
};

function getBaseLog(x, y) {
  return Math.log(y) / Math.log(x);
}

function pingSocket() {
  return new Promise(async (resolve, reject) => {
    if (wsConnection === undefined || !wsConnection || wsConnection.readyState !== 1) {
      resolve(false);
      return;
    }
    resolve(true);
  });
}

function IsJsonString(str) {
  return new Promise(async (resolve, reject) => {
    var result;
    try {
      result = JSON.parse(str);
    } catch (e) {
      resolve(false);
      return false;
    }
    resolve(result);
    return result;
  });
}

String.prototype.replaceAt = function (index, replacement) {
  return this.substring(0, index) + replacement + this.substring(index + replacement.length);
};

function getBalenaRelease() {
  return new Promise((resolve, reject) => {
    exec(
      'curl -X GET --header "Content-Type:application/json" "$BALENA_SUPERVISOR_ADDRESS/v1/device?apikey=$BALENA_SUPERVISOR_API_KEY"',
      (error, stdout, stderr) => {
        if (error) {
          //console.log(`error: ${error.message}`);
          resolve(false);
          return;
        }
        if (stderr) {
          //console.log(`stderr: ${stderr}`);
          //resolve(stderr);
          //return;
        }
        resolve(IsJsonString(stdout));
      }
    );
  });
}

async function runLedLoop(stop = undefined) {
  if (stop != undefined) {
    clearTimeout(ledIntervall);
    return;
  }
  //Set LED loop for feedback on device
  for (let index = 1; index <= 4; index++) {
    await ModbusHelper.setUserLed(index, false);
  }

  var enabled = false;
  var wsStatus = false;
  var updateStatus = false;

  const ledIntervall = setInterval(async () => {
    //Connected led x2
    await ModbusHelper.setUserLed(2, enabled);
    //socket connected led x3
    if (!wsStatus && (await pingSocket())) {
      wsStatus = true;
      await ModbusHelper.setUserLed(3, true);
    } else if (wsStatus && !(await pingSocket())) {
      await ModbusHelper.setUserLed(3, false);
      wsStatus = false;
    }

    //Check if balena update is running (led X4)
    if (!updateStatus && (await getBalenaRelease().update_pending)) {
      await ModbusHelper.setUserLed(4, true);
      updateStatus = true;
    } else if (updateStatus && !(await getBalenaRelease().update_pending)) {
      await ModbusHelper.setUserLed(4, false);
      updateStatus = false;
    }

    enabled = !enabled;
  }, 1000);
}

var runDimmerLoopTest = async (start = undefined) => {
  return new Promise(async (resolve, reject) => {
    if (start != undefined && start != true) {
      console.log("[DEBUG] dimmer test stop");
      clearTimeout(dimmerTestLoopTimer);
      dimmerTestLoopTimer = undefined;
      loopInfo.runningTest = false;
      loopInfo.loopTimeMs = 0;
      resolve(true);
      return;
    }
    if (dimmerTestLoopTimer != undefined) {
      console.log("[SYSTEM] dimmer test running");
      resolve(false);
      return;
    }

    console.log("[SYSTEM] dimmer test start");

    var time = 150;
    var counterStart = 30;
    var countLimit = 120;

    var counter = counterStart;
    var dimValue = 0;
    var countUp = false;
    loopInfo.runningTest = true;
    var dimmerLoopTimeMs = (countLimit - counterStart) * time;
    loopInfo.loopTimeMs = dimmerLoopTimeMs;

    dimmerTestLoopTimer = setInterval(async () => {
      dimValue = Math.pow(counter, 2) / (4000 / 3); //counter 100

      dimValue = Math.round(dimValue * 1000) / 1000;
      if (dimValue < 1) dimValue = 0;
      if (dimValue > 10) dimValue = 10;

      ModbusHelper.setAnalogPortMain(dimValue);
      ModbusHelper.setAnalogPortExt(dimValue, 1);
      ModbusHelper.setAnalogPortExt(dimValue, 2);
      ModbusHelper.setAnalogPortExt(dimValue, 3);
      ModbusHelper.setAnalogPortExt(dimValue, 4);

      if (counter < countLimit && countUp) {
        counter++;
      } else {
        if (countUp)
          await socketSendMessage({
            message: "dimmerlooptest",
            data: { loopRunning: loopInfo.runningTest, loopDirection: "down", loopTimeMs: dimmerLoopTimeMs },
          });
        countUp = false;
        counter--;
        if (counter <= counterStart) {
          if (!countUp)
            await socketSendMessage({
              message: "dimmerlooptest",
              data: { loopRunning: loopInfo.runningTest, loopDirection: "up", loopTimeMs: dimmerLoopTimeMs },
            });
          countUp = true;
        }
      }
    }, time);
    resolve(true);
  });
};

var runDimmerLoop = async (time = 100, start = undefined) => {
  return new Promise(async (resolve, reject) => {
    if (start != undefined) {
      console.log("[SYSTEM] Dimmer Loop stop");
      clearTimeout(dimmerLoopTimer);
      clearTimeout(dimmerLoopDebugTimer);
      dimmerLoopTimer = undefined;
      dimmerLoopDebugTimer = undefined;
      loopInfo.running = false;
      loopInfo.loopTimeMs = 0;
      await ModbusHelper.setAnalogPortExt(0, 1);
      await ModbusHelper.setAnalogPortMain(0);
      resolve(true);
      return;
    }
    if (dimmerLoopTimer != undefined || dimmerLoopDebugTimer != undefined) {
      console.log("[SYSTEM] Dimmer Loop is already running");
      resolve(false);
      return;
    }
    var counterStart = 400;
    var countUp = false;
    var countLimit = 1400;
    var counter = counterStart;
    var dimValue = 0;
    loopInfo.running = true;
    var dimmerLoopTimeMs = (countLimit - counterStart) * time;
    var deviceType = UnipiHelper.getDeviceType();
    loopInfo.loopTimeMs = dimmerLoopTimeMs;

    console.log("[SYSTEM] dimmer loop start - time: " + dimmerLoopTimeMs + "ms");

    dimmerLoopDebugTimer = setInterval(async () => {
      if (debug) console.log("[SYSTEM] Dimmer Loop: " + counter + " Dim Value: " + dimValue);
    }, 500);

    dimmerLoopTimer = setInterval(async () => {
      dimValue = Math.pow(counter, 2) / (500000 / 3); //counter 100
      //var dimValue =  (Math.pow(counter, 2))/(500000/3) // ounter 1000
      dimValue = Math.round(dimValue * 1000) / 1000;
      if (dimValue < 1) dimValue = 0;
      if (dimValue > 10) dimValue = 10;

      ModbusHelper.setAnalogPortMain(dimValue);

      if (deviceType.M523) {
        if (dimValue < MINIMALDIM) dimValue = MINIMALDIM;
        ModbusHelper.setAnalogPortExt(dimValue, 1); // set only if M523, else many errors on bus
      }

      if (counter < countLimit && countUp) {
        counter++;
      } else {
        if (countUp)
          socketSendMessage({ message: "dimmerloop", data: { loopRunning: loopInfo.running, loopDirection: "down", loopTimeMs: dimmerLoopTimeMs } });
        countUp = false;

        counter--;
        if (counter <= counterStart) {
          if (!countUp)
            socketSendMessage({ message: "dimmerloop", data: { loopRunning: loopInfo.running, loopDirection: "up", loopTimeMs: dimmerLoopTimeMs } });
          countUp = true;
        }
      }
    }, time);
    resolve(true);
  });
};

var initPins = async () => {
  return new Promise(async (resolve, reject) => {
    let deviceType = await UnipiHelper.getDeviceType();
    if (deviceType.L203) {
      UnipiHelper.attachInputCallback(8, 0, ["1.1", "1.2", "1.3", "1.4"], async (data) => {
        if (data.update) {
          for (let index = 0; index < data.pinTrigger.length; index++) {
            let element = data.pinTrigger[index];
            socketSendMessage({ message: "digitalin", data: { pinName: element } });
          }
        }
      });
      UnipiHelper.attachInputCallback(
        103,
        100,
        ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "2.15", "2.16"],
        async (data) => {
          if (data.update) {
            for (let index = 0; index < data.pinTrigger.length; index++) {
              let element = data.pinTrigger[index];
              socketSendMessage({ message: "digitalin", data: { pinName: element } });
            }
          }
        }
      );
      UnipiHelper.attachInputCallback(
        203,
        200,
        ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "3.9", "3.10", "3.11", "3.12", "3.13", "3.14", "3.15", "3.16"],
        async (data) => {
          if (data.update) {
            for (let index = 0; index < data.pinTrigger.length; index++) {
              let element = data.pinTrigger[index];
              socketSendMessage({ message: "digitalin", data: { pinName: element } });
            }
          }
        }
      );
      resolve(true);
      return;
    }
    if (deviceType.M523) {
      UnipiHelper.attachInputCallback(8, 0, ["1.1", "1.2", "1.3", "1.4"], async (data) => {
        if (data.update) {
          for (let index = 0; index < data.pinTrigger.length; index++) {
            let element = data.pinTrigger[index];
            socketSendMessage({ message: "digitalin", data: { pinName: element } });
          }
        }
      });
      UnipiHelper.attachInputCallback(116, 100, ["2.1", "2.2", "2.3", "2.4"], async (data) => {
        if (data.update) {
          for (let index = 0; index < data.pinTrigger.length; index++) {
            let element = data.pinTrigger[index];
            socketSendMessage({ message: "digitalin", data: { pinName: element } });
          }
        }
      });
      resolve(true);
      return;
    }
    if (deviceType.M303) {
      UnipiHelper.attachInputCallback(8, 0, ["1.1", "1.2", "1.3", "1.4"], async (data) => {
        if (data.update) {
          for (let index = 0; index < data.pinTrigger.length; index++) {
            let element = data.pinTrigger[index];
            socketSendMessage({ message: "digitalin", data: { pinName: element } });
          }
        }
      });
      UnipiHelper.attachInputCallback(
        103,
        100,
        [
          "2.1",
          "2.2",
          "2.3",
          "2.4",
          "2.5",
          "2.6",
          "2.7",
          "2.8",
          "2.9",
          "2.10",
          "2.11",
          "2.12",
          "2.13",
          "2.14",
          "2.15",
          "2.16",
          "2.17",
          "2.18",
          "2.19",
          "2.20",
          "2.21",
          "2.22",
          "2.23",
          "2.24",
          "2.25",
          "2.26",
          "2.27",
          "2.28",
          "2.29",
          "2.30",
        ],
        async (data) => {
          if (data.update) {
            for (let index = 0; index < data.pinTrigger.length; index++) {
              let element = data.pinTrigger[index];
              socketSendMessage({ message: "digitalin", data: { pinName: element } });
            }
          }
        }
      );
      resolve(true);
      return;
    }
    if (deviceType.M203) {
      UnipiHelper.attachInputCallback(8, 0, ["1.1", "1.2", "1.3", "1.4"], async (data) => {
        if (data.update) {
          for (let index = 0; index < data.pinTrigger.length; index++) {
            let element = data.pinTrigger[index];
            socketSendMessage({ message: "digitalin", data: { pinName: element } });
          }
        }
      });
      UnipiHelper.attachInputCallback(
        103,
        100,
        ["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "2.11", "2.12", "2.13", "2.14", "2.15", "2.16"],
        async (data) => {
          if (data.update) {
            for (let index = 0; index < data.pinTrigger.length; index++) {
              let element = data.pinTrigger[index];
              socketSendMessage({ message: "digitalin", data: { pinName: element } });
            }
          }
        }
      );
      resolve(true);
      return;
    }
    resolve(false);
    return;
  });
};

var wsMessageHandler = async (messageData) => {
  var jsonData = await IsJsonString(messageData);

  if (jsonData.hasOwnProperty("command")) {
    console.log("[SYSTEM] run command: " + jsonData.command);
    switch (jsonData.command) {
      case "lcstart":
        var dimValue = 100;
        await runDimmerLoop(100, false);
        await runDimmerLoopTest(false);
        if (jsonData.hasOwnProperty("value")) {
          dimValue = jsonData.value;
        }
        runDimmerLoop(dimValue);
        break;
      case "lcoff":
        await runDimmerLoop(100, false);
        await runDimmerLoopTest(false);
        UnipiHelper.setLcLevel(0);
        break;
      case "lcon":
        await runDimmerLoop(100, false);
        await runDimmerLoopTest(false);
        UnipiHelper.setLcLevel(90);
        break;
      case "lcset":
        await runDimmerLoop(100, false);
        await runDimmerLoopTest(false);
        let dimValue = 100;
        if (jsonData.hasOwnProperty("value")) {
          dimValue = jsonData.value;
          UnipiHelper.setLcLevel(dimValue);
        }
        break;
      case "setled":
        var ledNo = 0;
        var ledStatus = false;
        if (jsonData.hasOwnProperty("value")) {
          ledStatus = jsonData.value;
        }
        if (jsonData.hasOwnProperty("number")) {
          ledNo = jsonData.number;
        }
        await setLed(ledNo, ledStatus);
        break;
      default:
    }
  }
};

var socketSendMessage = async (messageData) => {
  return new Promise(async (resolve, reject) => {
    if (wsConnection === undefined) {
      console.log("[WS] ERROR send message failed, no connection");
      resolve(false);
      return;
    }
    wsConnection.send(JSON.stringify(messageData));
    resolve(true);
  });
};

wsServer.on("connection", async function (connection) {
  wsConnection = connection;
  connection.on("message", function message(data) {
    console.log("[WS] received: %s", data);
    wsMessageHandler(data);
  });

  connection.on("disconnect", function () {
    console.log("[WS] user disconnected");
  });

  // Response on User Connected
  const userId = v4();
  console.log(`[WS] Recieved a new connection.`);
  var balenaData = await getBalenaRelease();
  let deviceType = await UnipiHelper.getDeviceType();
  socketSendMessage({ message: "connected", data: { userId, loopInfo, balenaData, deviceType } });
  // Store the new connection and handle messages
  clients[userId] = connection;
  console.log(`[WS] ${userId} connected.`);
});

server.listen(WS_PORT, () => {
  console.log(`[WS] WebSocket server is running on port ${WS_PORT}`);
});

var init = async () => {
  console.log("[SYSTEM] ----- init start -----");
  if (process.argv.indexOf("-d") > -1) {
    console.log("[START] -d startup with debug");
    process.argv.forEach(function (val, index, array) {
      console.log(index + ": " + val);
    });
    debug = true;
  }

  //get some data from balena
  var appVersion = await getBalenaRelease();
  if (appVersion !== false) {
    console.log(appVersion);
  } else {
    console.log("[SYSTEM] no response from balena container");
  }

  //Init Modbus and Unipi Helpers
  ModbusHelper.init(DEVICE_ID, debug);
  UnipiHelper.init(debug);
  await ModbusHelper.connect(UNIPI_IP_LOCAL, UNIPI_MODBUS_PORT);
  await UnipiHelper.checkDeviceType();
  await initPins();
  await runDimmerLoop(100, false);

  //test loop for analog out test
  if (testLoop === "true") {
    runDimmerLoopTest(true);
    //UnipiHelper.startRelaisDemo(2);
  }
  await runLedLoop();

  console.log(await UnipiHelper.getDeviceType());
  console.log("[SYSTEM] MINDIM: " + MINIMALDIM);
  console.log("[SYSTEM] ----- init done -----");
};
init();

process.on("SIGINT", (_) => {
  console.log("SIGINT");
  process.exit(0);
});
