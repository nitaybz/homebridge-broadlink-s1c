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
    this.name = config.sensorName;
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
    this.log("getting Service for " + this.type);
            
    if (this.type == "Motion Sensor"){
        console.log("found motion sensor");
        this.service = new Service.MotionSensor(this.name);
        this.service
            .getCharacteristic(Characteristic.MotionDetected)
            .on('get', this.getState.bind(this));
    } else if (this.type == "Door Sensor"){
        console.log("found door sensor");
        this.service = new Service.ContactSensor(this.name);
        //this.service
        //    .getCharacteristic(Characteristic.ContactSensorState)
        //     .on('get', this.getState.bind(this));
    }
    
    this.intervalCheck = function(){
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
                            self.log(self.name + " sensor state is - " + sensors[i].status);
                            self.detected = (sensors[i].status == 1 ? true : false);
                            self.log(" detected state for " +self.name +" is - " + self.detected);
                            if (sensors[i].type = "Door Sensor") {
                                self.service.getCharacteristic(Characteristic.ContactSensorState).setValue(sensors[i].status == 1 ?
				                    Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
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

    };
    var self = this;
    self.intervalCheck();
    this.timer = setInterval(function(){
        self.intervalCheck();
    }, 5000);

}

BroadlinkSensor.prototype = {
    getServices: function() {
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Broadlink S1C')
            .setCharacteristic(Characteristic.Model, this.type)
            .setCharacteristic(Characteristic.SerialNumber, this.serial);
        
        return [this.service, informationService];
    },

    getState: function(callback) {
		this.log(this.name + " callback with - " + this.detected);
		callback(null, this.detected);
    }
}
