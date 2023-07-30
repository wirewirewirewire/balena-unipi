const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();

var DEVICE_ID = 0;
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

//return array if number is not set or the spesific bit if set as number
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

String.prototype.replaceAt = function (index, replacement) {
  return this.substring(0, index) + replacement + this.substring(index + replacement.length);
};

module.exports = {
  /** set the modbus ID to use with unipi
   * @param {number} deviceId
   * @param {boolean} debug
   */
  init: function (deviceId, debug = false) {
    DEVICE_ID = deviceId;
    DEBUG = debug;
  },
  /**connect to the modbus tcp server on the device
   * @param {string} ip the ip of the modbus device, default is local
   * @param {number} port the modbus tcp server port, default is 502
   * @return {Promise} true if connected
   */
  connect: async function (ip, port = 502) {
    return new Promise(async (resolve, reject) => {
      await client.connectTCP(ip, { port });
      await client.setID(DEVICE_ID);
      resolve(true);
    });
  },
  abc: async function (ip, port = 502) {
    return new Promise(async (resolve, reject) => {});
  },
  /**read register from modbus device
   * @param {number} register
   * @param {number} byteLength
   * @return {Promise} register value as array
   */
  readRegister: async function (register, byteLength) {
    return new Promise(async (resolve, reject) => {
      if (DEBUG) console.log("[MB READ] ID: " + DEVICE_ID, " Register: " + register, " Length: " + byteLength);
      try {
        await client.setID(DEVICE_ID);
        var registerData = await client.readHoldingRegisters(register, byteLength);
        resolve(registerData.data);
        return;
      } catch (e) {
        // if error return -1
        console.log("[MB READ] Error Register Read: " + e.message);
        resolve(false);
        return -1;
      }
    });
  },
  /**read register from modbus device
   * @param {number} register // start regsiter to read
   * @param {number} byteLength // how many coils to read
   * @return {Promise} register value as array (bools)
   *
   * */
  readCoil: async function (register, byteLength) {
    return new Promise(async (resolve, reject) => {
      if (DEBUG) console.log("[MB READ] ID: " + DEVICE_ID, " Coil: " + register, " Length: " + byteLength);
      try {
        await client.setID(DEVICE_ID);
        var registerData = await client.readCoils(register, byteLength);
        resolve(registerData.data);
      } catch (e) {
        // if error return -1
        console.log("[MB READ] Error Coil: " + e.message);
        resolve(false);
        return -1;
      }
    });
  },
  /**write register to modbus device
   * @param {number} register // start regsiter to read
   * @param {number} dataArray // data bytes to write, must be array of ints
   * @return {Promise} returns true if success
   */
  writeRegister: async function (register, dataArray) {
    return new Promise(async (resolve, reject) => {
      if (DEBUG) console.log("[MB WRITE] ID: " + DEVICE_ID, " Register: " + register, " Data: " + dataArray);
      try {
        await client.setID(DEVICE_ID);
        await client.writeRegisters(register, dataArray);
        //TODO: check write success
        resolve(true);
        return;
      } catch (e) {
        // if error return -1
        console.log("[MB READ] Error Register Write: " + e.message);
        resolve(false);
        return;
      }
    });
  },
  /*write data to modbus coils
   * @param {number} register // start regsiter to write
   * @param {number} data // data bits to write, must be array of bools
   * @return {Promise} returns true if success
   */
  writeCoil: async function (register, data) {
    return new Promise(async (resolve, reject) => {
      try {
        if (DEBUG) console.log("[MB WRITE] ID: " + DEVICE_ID, " Coil: " + register, " Data: " + data);
        await client.setID(DEVICE_ID);
        await client.writeCoils(register, data);
        //TODO: check write success
        resolve(true);
      } catch (e) {
        // if error return -1
        console.log("[MB READ] Error Coil: " + e.message);
        resolve(false);
        return -1;
      }
    });
  },
  setUserLed: async function (led, status) {
    return new Promise(async (resolve, reject) => {
      var ledByte = await this.readRegister(20, 1);
      var ledBits = getBitFromByte(ledByte);
      if (DEBUG) console.log("[LED] SET LED: " + led + " to: " + status);
      if (DEBUG) console.log("[LED] setLed: byte read: " + ledByte);
      if (DEBUG) console.log("[LED] setLed: bits read: " + ledBits);
      switch (led) {
        case 1:
          ledBits = status ? ledBits.replaceAt(16 - led, "1") : ledBits.replaceAt(16 - led, "0");
          break;
        case 2:
          ledBits = status ? ledBits.replaceAt(16 - led, "1") : ledBits.replaceAt(16 - led, "0");
          break;
        case 3:
          ledBits = status ? ledBits.replaceAt(16 - led, "1") : ledBits.replaceAt(16 - led, "0");
          break;
        case 4:
          ledBits = status ? ledBits.replaceAt(16 - led, "1") : ledBits.replaceAt(16 - led, "0");
          break;
        default:
          console.log("[LED] setLed Error: led not found");
      }
      ledByte = parseInt(ledBits, 2);
      if (DEBUG) console.log("[LED] setLed: byte after change: " + ledByte);
      if (DEBUG) console.log("[LED] setLed: bits after change: " + ledBits);
      await this.writeRegister(20, [ledByte]);
      resolve(true);
    });
  },
  setAnalogPortMain: async function (voltage) {
    return new Promise(async (resolve, reject) => {
      var floatTest = Float32ToBin(voltage); // 0011111111011001 1001100110011010
      //Write Voltage to AOR 1.1
      if (DEBUG) console.log("[ANALOG] Set Analog Out(1.1) to " + floatTest.float + "V");
      await this.writeRegister(3000, [floatTest.int.low, floatTest.int.high]);
      resolve(true);
    });
  },
  setAnalogPortExt: async function (voltage, port) {
    return new Promise(async (resolve, reject) => {
      var inputVoltage = voltage;
      if (inputVoltage > 10) inputVoltage = 10;

      var register = port + 101;
      if (register > 105) register = 105;
      if (register < 102) register = 102;

      var setNumberVoltage = 0; //needs range 0..4000 // 0-10V
      setNumberVoltage = (inputVoltage / 10) * 4000;
      if (setNumberVoltage > 4000) setNumberVoltage = 4000;
      setNumberVoltage = Math.round(setNumberVoltage);

      if (DEBUG) console.log("[ANALOG] Set Analog Ext Out(2." + port + ") to " + voltage + "V Number:" + setNumberVoltage);
      await this.writeRegister(register, [setNumberVoltage]); //Relay 2.1
      resolve(true);
    });
  },
};
