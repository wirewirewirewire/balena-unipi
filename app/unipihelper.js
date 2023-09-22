const ModbusHelper = require("./modbushelper.js");

var DEBUG = false;

var inputParserTimer = [];

var inputTriggerCount = {};
/*{
address: counter
address = startaddress+index
}*/

/*
Identify the device type via ports
L203: I:16 O:14
M523: I:4 O:5
M303: I:30 O:0
M203: I:16 O:14, register 3:false
*/
var DeviceType = {
  L203: false,
  M523: false,
  M303: false,
  M203: false,
  capability: {
    inputs: [],
    loop: false,
  },
};

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

var delay = async (time) => {
  return new Promise(async (resolve, reject) => {
    setTimeout(resolve, time);
  });
};

String.prototype.replaceAt = function (index, replacement) {
  return this.substring(0, index) + replacement + this.substring(index + replacement.length);
};

var getBitFromByte = (byte, number = undefined) => {
  var base2 = (byte >>> 0).toString(2);
  let fillZeros = "0".repeat(16 - base2.length);
  base2 = fillZeros + base2;
  if (number != undefined) {
    return base2[number];
  } else {
    return base2;
  }
};

function findFirstDifferencePosition(str1, str2) {
  const minLength = Math.min(str1.length, str2.length);

  for (let i = 0; i < minLength; i++) {
    if (str1[i] !== str2[i]) {
      return i;
    }
  }

  // If one string is longer than the other, return the position where they start to differ
  if (str1.length !== str2.length) {
    return minLength;
  }

  return -1; // No differences found
}

var readCounter = async (startaddress, analogaddress, pinNames) => {
  count = pinNames.length;
  let returnData = {
    update: false,
    pinTriggerCount: 0,
    pinTrigger: [],
  };
  return new Promise(async (resolve, reject) => {
    var registerData = await ModbusHelper.readRegister(startaddress, count * 2);
    var registerDataPins = await ModbusHelper.readRegister(analogaddress, 1);
    registerDataPins = getBitFromByte(registerDataPins[0]);

    if (inputTriggerCount.hasOwnProperty(analogaddress)) {
      if (inputTriggerCount[analogaddress] != registerDataPins && registerDataPins != undefined) {
        if (inputTriggerCount[analogaddress] == undefined) inputTriggerCount[analogaddress] = registerDataPins;
        let savedString = inputTriggerCount[analogaddress];
        console.log("Saved String: " + savedString);
        console.log("New String: " + registerDataPins);

        let difference = findFirstDifferencePosition(savedString, registerDataPins);
        inputTriggerCount[analogaddress] = registerDataPins;
        pinCount = count - difference;
        //console.log("[UNIPI] Input Trigger DIF: ");
        //console.log(pinCount);
        //console.log("Pin: " + pinNames[pinCount - 1]);
        returnData.update = true;
        returnData.pinTriggerCount++;
        returnData.pinTrigger.push(pinNames[pinCount - 1]);
        console.log("[UNIPI] Return Press Pin:");
        console.log(returnData);
        //console.log(inputTriggerCount);
      }
    } else {
      inputTriggerCount[analogaddress] = registerDataPins;
    }
    resolve(returnData);
    return;

    for (let index = 0; index < count * 2; index = index + 2) {
      var loopAddress = startaddress + index;
      var lowpart = getBitFromByte(registerData[index]);
      var highpart = getBitFromByte(registerData[index + 1]);
      var value = parseInt(highpart + lowpart, 2);
      if (DEBUG) console.log("[UNIPI] PinCheck Sense Addr: " + loopAddress + " Value: " + value + " Pin: " + pinNames[index / 2] + "");
      if (inputTriggerCount.hasOwnProperty(loopAddress)) {
        if (inputTriggerCount[loopAddress] != value) {
          inputTriggerCount[loopAddress] = value;
          returnData.update = true;
          if (!returnData.pinTrigger.includes(pinNames[index / 2])) {
            returnData.pinTriggerCount++;
            returnData.pinTrigger.push(pinNames[index / 2]);
            console.log("[UNIPI] Return Press Counter:");
            console.log(returnData);
            console.log(value);
          }
        }
      } else {
        inputTriggerCount[startaddress + index] = value;
      }
      //console.log(inputTriggerCount);
    }
    resolve(returnData);
  });
};

var parse16BitNumber = (byte) => {
  var data = {
    int: 0,
    bits16: 0,
    bits8high: 0,
    bits8low: 0,
    bytehigh: 0,
    bytelow: 0,
  };
  data.int = byte;
  data.bits16 = getBitFromByte(data.int);
  let half = Math.ceil(data.bits16.length / 2);
  data.bits8high = data.bits16.slice(0, half);
  data.bits8low = data.bits16.slice(half);
  data.bytehigh = parseInt(data.bits8high, 2);
  data.bytelow = parseInt(data.bits8low, 2);
  return data;
};

module.exports = {
  //set the modbus ID to use
  init: function (debug = false) {
    DEBUG = debug;
  },
  abc: async function () {
    return new Promise(async (resolve, reject) => {});
  },
  setLcLevel: async function (level) {
    if (DEBUG) console.log("[UNIPI] set lc level: " + level);
    return new Promise(async (resolve, reject) => {
      var inputLevel = level;
      inputLevel = Math.round((inputLevel / 100) * 10);

      if (inputLevel > 10) inputLevel = 10;
      if (inputLevel < 0) inputLevel = 0;

      await ModbusHelper.setAnalogPortMain(inputLevel);
      await ModbusHelper.setAnalogPortExt(10 - inputLevel, 1);

      resolve(true);
    });
  },
  startRelaisDemo: async function (loops) {
    if (DEBUG) console.log("[UNIPI] start relais demo");
    return new Promise(async (resolve, reject) => {
      for (let index2 = 0; index2 < loops; index2++) {
        for (let index = 0; index < 14; index++) {
          await delay(100);
          await ModbusHelper.writeCoil(100 + index, [true]); //Relay 2.1
        }
        for (let index = 0; index < 14; index++) {
          await delay(20);
          await ModbusHelper.writeCoil(100 + index, [false]); //Relay 2.1
        }
      }
      for (let index = 0; index < 14; index++) {
        await ModbusHelper.writeCoil(100 + index, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      }
      resolve(true);
    });
  },
  checkDeviceType: async function () {
    if (DEBUG) console.log("[UNIPI] chek device type");
    return new Promise(async (resolve, reject) => {
      //var registerData = await ModbusHelper.readRegister(1101, 1);
      var registerData = await ModbusHelper.readRegister(1101, 1);
      var registerData2 = await ModbusHelper.readRegister(1201, 1); // if false, no register
      var parseData = parse16BitNumber(registerData);
      var portsInput = parseData.bytehigh;
      var portsOutput = parseData.bytelow;

      //console.log(parseData);

      console.log("Input Ports: " + portsInput + " Output Ports: " + portsOutput);
      console.log("Register 2: " + registerData2[0]);
      //console.log(parseData.bytehigh);
      //console.log(parseData.bytelow);*

      if (portsInput === 16 && portsOutput === 14 && registerData2[0] !== undefined && registerData2[0] !== false && registerData2[0] !== 0) {
        if (DEBUG) console.log("[UNIPI] device type: unipi L203");
        DeviceType.L203 = true;
        DeviceType.capability.inputs = [
          "1.1",
          "1.2",
          "1.3",
          "1.4",
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
          "3.1",
          "3.2",
          "3.3",
          "3.4",
          "3.5",
          "3.6",
          "3.7",
          "3.8",
          "3.9",
          "3.10",
          "3.11",
          "3.12",
          "3.13",
          "3.14",
          "3.15",
          "3.16",
        ];
        DeviceType.capability.loop = false;
        resolve(true);
        return;
      }
      if (portsInput === 4 && portsOutput === 5) {
        if (DEBUG) console.log("[UNIPI] device type: unipi M523");
        DeviceType.M523 = true;
        DeviceType.capability.inputs = ["1.1", "1.2", "1.3", "1.4", "2.1", "2.2", "2.3", "2.4"];
        DeviceType.capability.loop = true;
        resolve(true);
        return;
      }
      if (portsInput === 30 && portsOutput === 0) {
        if (DEBUG) console.log("[UNIPI] device type: unipi M303");
        DeviceType.M303 = true;
        DeviceType.capability.inputs = [
          "1.1",
          "1.2",
          "1.3",
          "1.4",
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
        ];
        DeviceType.capability.loop = false;

        resolve(true);
        return;
      }
      if (portsInput === 16 && portsOutput === 14 && (registerData2[0] === false || registerData2[0] == undefined)) {
        if (DEBUG) console.log("[UNIPI] device type: unipi M203");
        DeviceType.M203 = true;
        DeviceType.capability.inputs = [
          "1.1",
          "1.2",
          "1.3",
          "1.4",
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
        ];
        DeviceType.capability.loop = false;

        resolve(true);
        return;
      }
      console.log("[UNIPI] ERROR: device type not found");
      resolve(false);
      return;
    });
  },
  getDeviceType: async function () {
    return new Promise(async (resolve, reject) => {
      //TODO return also a pin map
      resolve(DeviceType);
    });
  },
  clearInputCallback: async function () {
    return new Promise(async (resolve, reject) => {
      //clear all timers of pin monitoring
      for (let index = 0; index < inputParserTimer.length; index++) {
        try {
          clearInterval(inputParserTimer[index]);
        } catch (e) {
          console.log("[UNIPI] ERROR: clear interval(" + index + "): " + e.message);
        }
      }
      resolve(true);
    });
  },

  attachInputCallback: async function (startaddress, analogaddress, nameArray, callback) {
    if (DEBUG) console.log("[UNIPI] begin attach input callback start: " + startaddress + " count: " + nameArray.length);
    return new Promise(async (resolve, reject) => {
      //attach timer to pin monitoring
      let timer = setInterval(async () => {
        if (DEBUG) console.log("[UNIPI] --- PinCheck Loop ---");
        var triggerPinData = await readCounter(startaddress, analogaddress, nameArray);
        if (triggerPinData.update) {
          callback(triggerPinData);
        }
        if (DEBUG) console.log(triggerPinData);
      }, 1000);
      inputParserTimer.push(timer); //add timer to array to cancel later
    });
  },
};
