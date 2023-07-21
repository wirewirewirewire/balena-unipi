const util = require("util");
var path = require("path");
var fs = require("fs");
const ModbusRTU = require("modbus-serial");
const { v4 } = require("uuid");
const http = require("http");
const { WebSocketServer } = require("ws");
var EventEmitter = require("events").EventEmitter;
const client = new ModbusRTU();
var theEvent = new EventEmitter();
const { networkInterfaces } = require("os");

const server = http.createServer();
const wsServer = new WebSocketServer({ server });

const DEVICE_ID = 0;
const UNIPI_IP_LOCAL = "127.0.0.1";
const UNIPI_MODBUS_PORT = 502;
const WS_PORT = 8007;

let debug = false;

let testRun = false;
const clients = {};
var wsConnection;
let analogTestValue = 0;
var dimmerLoopTimer = undefined;
var dimmerLoopDebugTimer = undefined;
var dimmerLoopTimeMs = 0;
var loopRunning = false

const nets = networkInterfaces();
const results = Object.create(null); // Or just '{}', an empty object

function IsJsonString(str) {
  return new Promise(async (resolve, reject) => {
    var result;
    try {
      result = JSON.parse(str);
    } catch (e) {
      resolve(str);
      return str;
    }
    resolve(result);
    return result;
  });
}

const BinToFloat32 = (str) => {
  var int = parseInt(str, 2);
  if (int > 0 || int < 0) {
    var sign = int >>> 31 ? -1 : 1;
    var exp = ((int >>> 23) & 0xff) - 127;
    var mantissa = ((int & 0x7fffff) + 0x800000).toString(2);
    var float32 = 0;
    for (i = 0; i < mantissa.length; i += 1) {
      float32 += parseInt(mantissa[i]) ? Math.pow(2, exp) : 0;
      exp--;
    }
    return float32 * sign;
  } else return 0;
};

const Float32ToBin = (float32) => {
  const HexToBin = (hex) => parseInt(hex, 16).toString(2).padStart(32, "0");
  const getHex = (i) => ("00" + i.toString(16)).slice(-2);
  let view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, float32);
  let floatNumberArray = HexToBin(
    Array.apply(null, { length: 4 })
      .map((_, i) => getHex(view.getUint8(i)))
      .join("")
  );

  let half = Math.ceil(floatNumberArray.length / 2);
  let firstHalf = floatNumberArray.slice(0, half);
  let secondHalf = floatNumberArray.slice(half);
  let inthigh = parseInt(firstHalf, 2);
  let intlow = parseInt(secondHalf, 2);

  return { bin: { high: firstHalf, low: secondHalf }, int: { high: inthigh, low: intlow }, float: float32 };
};

delay = async (time) => {
  return new Promise(async (resolve, reject) => {
    setTimeout(resolve, time);
  });
};

//return array if number is not set or the spesific bit if set as number
getBitFromByte = (byte, number = undefined) => {
  var base2 = byte.toString(2);
  let fillZeros = "0".repeat(16 - base2.length);
  base2 = fillZeros + base2;
  if (number != undefined) {
    return base2[number];
  } else {
    return base2;
  }
};

readModbusRegister = async (deviceId, register, byteLength) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (debug) console.log("[MB READ] ID: " + deviceId, " Register: " + register, " Length: " + byteLength);
      await client.setID(deviceId);
      var registerData = await client.readHoldingRegisters(register, byteLength);
      resolve(registerData.data);
    } catch (e) {
      // if error return -1
      console.log("[MB READ] Error Register: " + e.message);
      resolve(false);
      return -1;
    }
  });
};

readModbusCoil = async (deviceId, register, byteLength) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (debug) console.log("[MB READ] ID: " + deviceId, " Coil: " + register, " Length: " + byteLength);
      await client.setID(deviceId);
      var registerData = await client.readCoils(register, byteLength);
      resolve(registerData.data);
    } catch (e) {
      // if error return -1
      console.log("[MB READ] Error Coil: " + e.message);
      resolve(false);
      return -1;
    }
  });
};
//data must be array of int
writeModbusRegister = async (deviceId, register, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (debug) console.log("[MB WRITE] ID: " + deviceId, " Register: " + register, " Data: " + data);
      await client.setID(deviceId);
      var registerWriteResolve = await client.writeRegisters(register, data);
      resolve(registerWriteResolve);
    } catch (e) {
      // if error return -1
      console.log("[MB READ] Error Register Write: " + e.message);
      resolve(false);
      return -1;
    }
  });
};

setAnalogVoltage = async (voltage) => {
  return new Promise(async (resolve, reject) => {
    var floatTest = Float32ToBin(voltage); // 0011111111011001 1001100110011010
    if (debug) console.log(floatTest);
    //Write Voltage to AOR 1.1
    if (debug) console.log("[SYSTEM] Set Analog Out(1.1) to " + floatTest.float + "V");
    await writeModbusRegister(DEVICE_ID, 3000, [floatTest.int.low, floatTest.int.high]); //Relay 2.1
    resolve(true);
  });
};

//data must be array of int
writeModbusCoil = async (deviceId, register, data) => {
  return new Promise(async (resolve, reject) => {
    try {
      if (debug) console.log("[MB WRITE] ID: " + deviceId, " Coil: " + register, " Data: " + data);
      await client.setID(deviceId);
      var coilResponse = await client.writeCoils(register, data);
      resolve(coilResponse);
    } catch (e) {
      // if error return -1
      console.log("[MB READ] Error Coil: " + e.message);
      resolve(false);
      return -1;
    }
  });
};

// open connection to a tcp line
function initModbus(ip, port) {
  return new Promise(async (resolve, reject) => {
    await client.connectTCP(ip, { port: port });
    resolve(true);
  });
}

function startLedLoop(stop = undefined) {
  if (stop != undefined) {
    clearTimeout(ledIntervall);
    return;
  }
  var counter = 2;
  const ledIntervall = setInterval(async () => {
    await writeModbusRegister(DEVICE_ID, 20, [counter]); //Relay 2.1

    if (counter < 8) {
      counter = counter + counter;
    } else {
      counter = 2;
    }
  }, 1000);
}

relaisDemo = async (loops) => {
  return new Promise(async (resolve, reject) => {
    for (let index2 = 0; index2 < loops; index2++) {
      for (let index = 0; index < 14; index++) {
        await delay(100);
        await writeModbusCoil(DEVICE_ID, 100 + index, [true]); //Relay 2.1
      }
      for (let index = 0; index < 14; index++) {
        await delay(20);
        await writeModbusCoil(DEVICE_ID, 100 + index, [false]); //Relay 2.1
      }
    }
    for (let index = 0; index < 14; index++) {
      await writeModbusCoil(DEVICE_ID, 100 + index, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); //Relay 2.1
    }
    resolve(true);
  });
};

function getBaseLog(x, y) {
  return Math.log(y) / Math.log(x);
}

test = async () => {
  /*
  //Get Bits from a Byte
  //testBits = getBitFromByte(9);

  //Set bits with 0b00010001 for example

  //Reg Read Example
  var readDataRegister = await readModbusRegister(DEVICE_ID, 3000, 2);
  console.log("[SYSTEM] Register 3000 Read: " + readDataRegister);
  console.log("[SYSTEM] Register DOUT Voltage Dec: " + BinToFloat32(getBitFromByte(readDataRegister[1]) + getBitFromByte(readDataRegister[0])));

  //Coil Read Example
  var readDataCoil = await readModbusCoil(DEVICE_ID, 4, 8); //Digital Input 1.1 - 1.4
  console.log("[SYSTEM] Coil 4-11: " + readDataCoil);

  //Write register and coil example
  //await writeModbusCoil(DEVICE_ID, 100, false); //Relay 2.1
  //await writeModbusRegister(DEVICE_ID, 1, [0b000]); //DOUT 1.1-1.4 1

  //Convert float to usable json array with two 16 bit values to send

  if (testRun) await relaisDemo(1);*/

  console.log();
  runDimmerLoop(800);
};

setLcLevel = async (level) => {
  return new Promise(async (resolve, reject) => {
    var inputLevel = level;
    if (inputLevel > 100) inputLevel = 100;
    if (inputLevel < 0) inputLevel = 0;

    setAnalogVoltage(inputLevel / 10);
    resolve(true);
  });
};

runDimmerLoop = async (time = 100, start = undefined) => {
  return new Promise(async (resolve, reject) => {
    if (start != undefined) {
      console.log("[SYSTEM] Dimmer Loop stop");
      clearTimeout(dimmerLoopTimer);
      clearTimeout(dimmerLoopDebugTimer);
      dimmerLoopTimer = undefined;
      dimmerLoopDebugTimer = undefined;
      loopRunning = false;
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
    loopRunning = true;
    dimmerLoopTimeMs = (countLimit - counterStart) * time;

    console.log("[SYSTEM] dimmer loop time: " + dimmerLoopTimeMs + "ms");

    dimmerLoopDebugTimer = setInterval(async () => {
      console.log("[SYSTEM] Dimmer Loop: " + counter + " Dim Value: " + dimValue);
    }, 500);

    dimmerLoopTimer = setInterval(async () => {
      dimValue = Math.pow(counter, 2) / (500000 / 3); //counter 100
      //var dimValue =  (Math.pow(counter, 2))/(500000/3) // ounter 1000
      dimValue = Math.round(dimValue * 1000) / 1000;
      if (dimValue < 1) dimValue = 0;
      if (dimValue > 10) dimValue = 10;

      setAnalogVoltage(dimValue);

      if (counter < countLimit && countUp) {
        counter++;
      } else {
        if (countUp) socketSendMessage({ message: "dimmerloop", data: { loopRunning, loopDirection: "down", loopTimeMs: dimmerLoopTimeMs } });
        countUp = false;

        counter--;
        if (counter <= counterStart) {
          if (!countUp) socketSendMessage({ message: "dimmerloop", data: { loopRunning, loopDirection: "up", loopTimeMs: dimmerLoopTimeMs } });
          countUp = true;
        }
      }
    }, time);
    resolve(true);
    //setAnalogVoltage(1.5);
  });
};

init = async () => {
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      // 'IPv4' is in Node <= 17, from 18 it's a number 4 or 6
      const familyV4Value = typeof net.family === "string" ? "IPv4" : 4;
      if (net.family === familyV4Value && !net.internal) {
        if (!results[name]) {
          results[name] = [];
        }
        results[name].push(net.address);
      }
    }
  }
  console.log("[SYSTEM] found ip: " + results.eth0);

  await initModbus(UNIPI_IP_LOCAL, UNIPI_MODBUS_PORT);
  startLedLoop();
  console.log("[SYSTEM] modbus ready");
};

init();

//test();

wsMessageHandler = async (messageData) => {
  var jsonData = await IsJsonString(messageData);

  if (jsonData.hasOwnProperty("command")) {
    console.log("[SYSTEM] run command: " + jsonData.command);
    switch (jsonData.command) {
      case "lcstart":
        var dimValue = 100;
        runDimmerLoop(100, false);
        if (jsonData.hasOwnProperty("value")) {
          dimValue = jsonData.value;
        }
        runDimmerLoop(dimValue);
        break;
      case "lcoff":
        runDimmerLoop(100, false);
        setLcLevel(0);
        break;
      case "lcon":
        runDimmerLoop(100, false);
        setLcLevel(90);
        break;
      default:
    }
  }
};

socketSendMessage = async (messageData) => {
  return new Promise(async (resolve, reject) => {
    if (wsConnection === undefined) {
      console.log("[WS] ERROR send message failed, no connection");
      resolve(false);
    }
    wsConnection.send(JSON.stringify(messageData));
    resolve(true);
  });
};

wsServer.on("connection", function (connection) {
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
  socketSendMessage({ message: "connected", data: { userId,loopRunning} });
  // Store the new connection and handle messages
  clients[userId] = connection;
  console.log(`[WS] ${userId} connected.`);
});

server.listen(WS_PORT, () => {
  console.log(`[WS] WebSocket server is running on port ${WS_PORT}`);
});

if (debug) {
  process.argv.forEach(function (val, index, array) {
    console.log(index + ": " + val);
  });
}

if (process.argv.indexOf("-d") > -1) {
  console.log("[START] -d startup with debug");
  debug = true;
}

if (process.argv.indexOf("-a") > -1) {
  let index = process.argv.indexOf("-a");
  analogTestValue = process.argv[index + 1];
  console.log("[START] -a analog value set: " + analogTestValue);
}

if (process.argv.indexOf("-t") > -1) {
  console.log("[START] -t go for test run: " + analogTestValue);
  testRun = true;
}

process.on("SIGINT", (_) => {
  console.log("SIGINT");
  process.exit(0);
});
