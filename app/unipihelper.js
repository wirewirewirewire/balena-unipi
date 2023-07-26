const ModbusHelper = require("./modbushelper.js");

var DEBUG = false;

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

module.exports = {
  //set the modbus ID to use
  init: function (debug = false) {
    DEBUG = debug;
  },
  abc: function () {
    return new Promise(async (resolve, reject) => {});
  },
  setLcLevel: function (level) {
    return new Promise(async (resolve, reject) => {
      var inputLevel = level;
      if (inputLevel > 100) inputLevel = 100;
      if (inputLevel < 0) inputLevel = 0;

      await ModbusHelper.setAnalogPortMain(dimValue);
      resolve(true);
    });
  },
  startRelaisDemo: function (loops) {
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
};
