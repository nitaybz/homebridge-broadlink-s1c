var Service, Characteristic;
var broadlink = require('broadlinkjs-s1c');

module.exports = function(homebridge) {
    console.log(homebridge);
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

    this.log("Discovering");
    
    
    var b = new broadlink();
    this.log("Discovering");
    b.discover();
    b.on("deviceReady", (dev) => {
        if (dev.type == "S1C") {
            dev.get_sensors_status();
            dev.on("sensors_status", (status_array) => {
                dev.exit();
                clearInterval(refresh);
                this.count = status_array["count"];
                this.sensors = status_array["sensors"];
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

broadlinkS1C.prototype = {
    accessories: function(callback) {
        //For each device in cfg, create an accessory!
        var myAccessories = [];
        var foundSensor = [{}];
        for (var i = 0; i < this.count; i++) {
                    if (sensors[i].type == ("Motion Sensor" || "Door Sensor")) {
                        foundSensor[i].accessoryName = this.name;
                        foundSensor[i].sensorName = this.sensors[i].name;
                        foundSensor[i].serial = this.sensors[i].serial;
                        foundSensor[i].type = this.sensors[i].type;
                        foundSensor[i].ip = this.sensors[i].ip;
                        foundSensor[i].mac = this.sensors[i].mac;
                        var accessory = new BroadlinkSensor(this.log, foundSensor[i]);
                        myAccessories.push(accessory);
                        this.log('Created ' + foundSensor[i].accessoryName + " " + foundSensor[i].type +' Named: ' + foundSensor[i].sensorName);
                    }
                }
        callback(myAccessories);
    }
}

function BroadlinkSensor(log, config) {
    this.log = log;
    this.config = config;
    this.serial = sconfig.serial || "";
    this.type = config.type;
    this.name = config.name + +"_"+ config.sensorName;
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
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink S1C')
            .setCharacteristic(Characteristic.Model, this.type)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);
            
        if (this.type == "Motion Sensor"){
            console.log("found motion sensor");
            var MotionService = new Service.MotionSensor(this.name);
            MotionService
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', this.getState.bind(this));
            return [MotionService, informationService];
        } else if (this.type == "Door Sensor"){
            console.log("found door sensor");
            var DoorService = new Service.ContactSensor(this.name);
            DoorService
                .getCharacteristic(Characteristic.ContactSensorState)
                .on('get', this.getState.bind(this));
            return [DoorService, informationService];
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
