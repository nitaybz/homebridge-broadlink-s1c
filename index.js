var Accessory, Service, Characteristic, UUIDGen;
var broadlink = require('broadlinkjs-s1c');

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform("homebridge-broadlink-s1c", "broadlinkS1C", broadlinkS1C);
}

function broadlinkS1C(log, config, api) {
    this.log = log;
    this.config = config;

    if (api) {
        this.api = api;
    }

}

broadlinkS1C.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var foundSensor = this.config.accessories;
        var myAccessories = [];
        var b = new broadlink();
        b.discover();
        b.on("deviceReady", (dev) => {
            if (dev.type == "S1C") {
                dev.get_sensors_status();
                dev.on("sensors_status", (status_array) => {
                    var count = status_array["count"];
                    var sensors = status_array["sensors"];
                    clearInterval(refresh);
                    for (var i = 0; i < count; i++) {
                        if (sensors[i].type == ("Motion Sensor" || "Door Sensor")) {
                            foundSensor[i].sensorName = sensors[i].name;
                            foundSensor[i].serial = sensors[i].serial;
                            foundSensor[i].type = sensors[i].type;
                            var accessory = new BroadlinkSensor(this.log, foundSensor[i]);
                            myAccessories.push(accessory);
                            this.log('Created ' + accessory.name + accessory.type +' Named: ' + accessory.sensorName);
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
    this.sname = config.sensorName || "";
    this.serial = config.serial || "";
    this.type = config.type;
    this.name = config.name + +"_"+ this.sname;
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
        var services = [];
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink S1C')
            .setCharacteristic(Characteristic.Model, this.type)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);
        if (this.type == "Motion Sensor"){
            var MotionhService = new Service.MotionSensor(this.name, UUIDGen.generate(this.serial));
            MotionhService
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', this.getState.bind(this));
        } else if (this.type == "Door Sensor"){
            var DoorService = new Service.ContactSensor(this.name, UUIDGen.generate(this.serial));
            DoorService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on('get', this.getState.bind(this));
        }
        
        services.push(switchService, informationService);

        return services;
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
                    self.log(self.name + self.sname + " power is on - " + pwr);
                    for (var i=0; i<count; i++){
                        if (self.serial == sensors[i].serial){
                            if (sensors[i].status = 0) {
                            self.detected = false;
                            return callback(null, false);
                        } else {
                            self.detected = true;
                            return callback(null, true);
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
