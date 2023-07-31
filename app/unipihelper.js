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

var readCounter = async (startaddress, pinNames) => {
  count = pinNames.length;
  let returnData = {
    update: false,
    pinTriggerCount: 0,
    pinTrigger: [],
  };
  return new Promise(async (resolve, reject) => {
    var registerData = await ModbusHelper.readRegister(startaddress, count * 2);

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
          returnData.pinTriggerCount++;
          returnData.pinTrigger.push(pinNames[index / 2]);
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

      //console.log(registerData2[0]);
      //console.log(parseData.bytehigh);
      //console.log(parseData.bytelow);*

      if (portsInput === 16 && portsOutput === 14 && registerData2[0] !== undefined && registerData2[0] !== false && registerData2[0] !== 0) {
        if (DEBUG) console.log("[UNIPI] device type: unipi L203");
        DeviceType.L203 = true;
        resolve(true);
        return;
      }
      if (portsInput === 4 && portsOutput === 5) {
        if (DEBUG) console.log("[UNIPI] device type: unipi M523");
        DeviceType.M523 = true;
        resolve(true);
        return;
      }
      if (portsInput === 30 && portsOutput === 0) {
        if (DEBUG) console.log("[UNIPI] device type: unipi M303");
        DeviceType.M303 = true;
        resolve(true);
        return;
      }
      if (portsInput === 16 && portsOutput === 14 && registerData2[0] === false) {
        if (DEBUG) console.log("[UNIPI] device type: unipi M203");
        DeviceType.M203 = true;
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
      resolve(DeviceType);
    });
  },

  attachInputCallback: async function (startaddress, nameArray, callback) {
    if (DEBUG) console.log("[UNIPI] begin attach input callback start: " + startaddress + " count: " + nameArray.length);
    return new Promise(async (resolve, reject) => {
      //attach timer to pin monitoring
      let timer = setInterval(async () => {
        if (DEBUG) console.log("[UNIPI] --- PinCheck Loop ---");
        var triggerPinData = await readCounter(startaddress, nameArray);
        if (triggerPinData.update) {
          callback(triggerPinData);
        }
        if (DEBUG) console.log(triggerPinData);
      }, 100);
      inputParserTimer.push(timer); //add timer to array to cancel later
    });
  },
};
