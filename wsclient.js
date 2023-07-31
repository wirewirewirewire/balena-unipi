const util = require("util");
var path = require("path");
var fs = require("fs");
const { WebSocket } = require("ws");

//const UNIPI_IP = "192.168.225.143";
var LISTEN_IP = "127.0.0.1";

if (process.argv.indexOf("-l") > -1) {
  let index = process.argv.indexOf("-l");
  LISTEN_IP = process.argv[index + 1];
  console.log("[START] -l set IP to: " + LISTEN_IP);
}

const ws = new WebSocket("ws://" + LISTEN_IP + ":8007");

let debug = false;
let wsOpen = false;

ws.on("message", function message(data) {
  console.log("Message: " + data);
  //ws.send(JSON.stringify({ command: "lcstart" }));
});

ws.on("open", function open() {
  //ws.send(JSON.stringify({ command: "lcoff" }));
  wsOpen = true;
  //process.exit(0);
});

function wsInitAwait() {
  return new Promise(async (resolve, reject) => {
    const wsInitTimer = setInterval(async () => {
      if (wsOpen) {
        console.log("[SYSTEM] socket is running");
        clearTimeout(wsInitTimer);
        resolve(true);
      }
    }, 50);
  });
}

var init = async () => {
  console.log("[START] ...connecting to " + LISTEN_IP + ":8007");
  await wsInitAwait();

  if (process.argv.indexOf("-d") > -1) {
    console.log("[START] -d startup with debug");
    debug = true;
  }

  if (debug) {
    process.argv.forEach(function (val, index, array) {
      console.log(index + ": " + val);
    });
  }

  if (process.argv.indexOf("-c") > -1) {
    let index = process.argv.indexOf("-c");
    let commandInput = process.argv[index + 1];
    console.log("[START] -c command set: " + commandInput);
    ws.send(JSON.stringify({ command: commandInput }));
  }

  if (process.argv.indexOf("-f") > -1) {
    let index = process.argv.indexOf("-f");
    let fadeValue = process.argv[index + 1];
    console.log("[START] -f fade the glass with time: " + fadeValue);
    ws.send(JSON.stringify({ command: "lcstart", value: fadeValue }));
  }

  if (process.argv.indexOf("-i") > -1) {
    let index = process.argv.indexOf("-i");
    let ledNo = process.argv[index + 1];
    let ledValue = process.argv[index + 2];
    console.log("[START] -l set led: " + ledNo + " to: " + ledValue);
    ws.send(JSON.stringify({ command: "setled", number: ledNo, value: ledNo }));
  }
};
init();

process.on("SIGINT", (_) => {
  console.log("SIGINT");
  process.exit(0);
});
