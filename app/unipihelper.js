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

String.prototype.replaceAt = function (index, replacement) {
  return this.substring(0, index) + replacement + this.substring(index + replacement.length);
};

module.exports = {
  //set the modbus ID to use
  init: function (debug = false) {
    DEBUG = debug;
  },
  abc: function (ip, port = 502) {
    return new Promise(async (resolve, reject) => {});
  },
};
