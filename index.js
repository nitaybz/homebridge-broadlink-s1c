var Service, Characteristic;
var broadlink = require('broadlinkjs-s1c');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    //UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform("homebridge-broadlink-s1c", "broadlinkS1C", broadlinkS1C);
}

function broadlinkS1C(log, config, api) {
    this.log = log;
    this.config = config;
    this.name = config.name;
    this.ip = config.ip;
    this.mac = config.mac;
    if (api) {
        this.api = api;
    }

}

broadlinkS1C.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var myAccessories = [];
        var b = new broadlink();
        b.discover();
        this.log("Discovering");
        b.on("deviceReady", (dev) => {
            this.log("deviceReady");
            if (dev.type == "S1C") {
                this.log("S1C Detected");
                dev.get_sensors_status();
                dev.on("sensors_status", (status_array) => {
                    dev.exit();
                    clearInterval(refresh);
                    var count = status_array["count"];
                    var sensors = status_array["sensors"];
                    this.log("count is " + count);
                    this.log("Creating Accessories");
                    for (var i = 0; i < count; i++) {
                        if ((sensors[i].type == "Motion Sensor") || (sensors[i].type ==  "Door Sensor")) {
                            var foundSensor = {};
                            foundSensor.accessoryName = this.name;
                            foundSensor.sensorName = sensors[i].name;
                            foundSensor.serial = sensors[i].serial;
                            foundSensor.type = sensors[i].type;
                            foundSensor.ip = this.ip;
                            foundSensor.mac = this.mac;
                            var accessory = new BroadlinkSensor(this.log, foundSensor);
                            myAccessories.push(accessory);
                            this.log('Created ' + foundSensor.accessoryName + "  - " + foundSensor.type +' Named: ' + foundSensor.sensorName);
                        }
                    }
                    callback(myAccessories);
                });
            } else {
                console.log(dev.type + "@" + dev.host.address + " found... not S1C!");
                dev.exit();
            }
        });
        var refresh = setInterval(function(){
            b.discover();
        }, 1000);
        
    }
}

function BroadlinkSensor(log, config) {
    this.log = log;
    this.config = config;
    this.serial = config.serial || "";
    this.type = config.type;
    this.sensorName = config.sensorName;
    this.name = config.accessoryName +"_"+ config.sensorName;
    this.ip = config.ip;
    this.mac = config.mac;
    this.detected = false;

    if (!this.ip && !this.mac) throw new Error("You must provide a config value for 'ip' or 'mac'.");

    // MAC string to MAC buffer
    this.mac_buff = function(mac) {
        var mb = new Buffer(6);
        if (mac) {
            var values = mac.split(':');
            if (!values || values.length !== 6) {
                throw new Error('Invalid MAC [' + mac + ']; should follow pattern ##:##:##:##:##:##');
            }
            for (var i = 0; i < values.length; ++i) {
                var tmpByte = parseInt(values[i], 16);
                mb.writeUInt8(tmpByte, i);
            }
        } else {
            //this.log("MAC address emtpy, using IP: " + this.ip);
        }
        return mb;
    }
}

BroadlinkSensor.prototype = {
    getServices: function() {
        this.log("getting Service for " + this.type);
        this.informationService = new Service.AccessoryInformation();
        this.informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink S1C')
            .setCharacteristic(Characteristic.Model, this.type)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);
            
        if (this.type == "Motion Sensor"){
            console.log("found motion sensor");
            this.MotionService = new Service.MotionSensor(this.sensorName);
            this.MotionService
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', this.getState.bind(this));
            return [this.MotionService, this.informationService];
        } else if (this.type == "Door Sensor"){
            console.log("found door sensor");
            this.DoorService = new Service.ContactSensor(this.sensorName);
            this.DoorService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on('get', this.getState.bind(this));
            return [this.DoorService, this.informationService];
        }
    },

    getState: function(callback) {
        var self = this;
        var b = new broadlink();
        b.discover();

        b.on("deviceReady", (dev) => {
            if (self.mac_buff(self.mac).equals(dev.mac) || dev.host.address == self.ip) {
                dev.get_sensors_status();
                dev.on("sensors_status", (status_array) => {
                    var sensors = status_array["sensors"];
                    var count = status_array["count"];
                    dev.exit();
                    clearInterval(checkAgain);
                    
                    for (var i=0; i<count; i++){
                        if (self.serial == sensors[i].serial){
                            if (sensors[i].type = "Motion Sensor") {
                                self.MotionService.getCharacteristic(Characteristic.MotionDetected)
                                    .setValue(sensors[i].status = 1 ? true : false);
                                self.detected = false;
                                self.log(self.name + " detected state is - " + self.detected);
                                return callback(null, 1);
                            } else if (sensors[i].type = "Door Sensor") {
                                self.DoorService.getCharacteristic(Characteristic.ContactSensorState)
                                    .setValue(sensors[i].status = 1 ? 0 : 1);
                                self.detected = true;
                                self.log(self.name + " detected state is - " + self.detected);
                                return callback(null, 0);
                            }
                        }
                    }
                });
            } else {
                dev.exit();
            }
        });
        var checkAgain = setInterval(function() {
            b.discover();
        }, 1000)

    }
}
