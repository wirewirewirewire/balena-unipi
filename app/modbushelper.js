const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();

var DEVICE_ID = 0;

module.exports = {
  //set the modbus ID to use
  init: function (deviceId) {
    DEVICE_ID = deviceId;
  },
  //default port is 502
  connect: function (ip, port = 502) {
    return new Promise(async (resolve, reject) => {
      await client.connectTCP(ip, { port });
      resolve(true);
    });
  },
};
