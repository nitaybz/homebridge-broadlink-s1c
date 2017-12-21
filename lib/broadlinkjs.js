var util = require('util');
let EventEmitter = require('events');
let dgram = require('dgram');
let os = require('os');
let crypto = require('crypto');

var Broadlink = module.exports = function() {
    EventEmitter.call(this);
    this.devices = {};
}
util.inherits(Broadlink, EventEmitter);


Broadlink.prototype.genDevice = function(devtype, host, mac) {
    var dev;
    if (devtype == 0x2722) { // S1C
        dev = new device(host, mac);
        dev.s1c();
        return dev;
    } else return null;
}

Broadlink.prototype.discover = function() {
    self = this;
    var interfaces = os.networkInterfaces();
    var addresses = [];
    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === 'IPv4' && !address.internal) {
                addresses.push(address.address);
            }
        }
    }
    var address = addresses[0].split('.');

    var cs = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    cs.on('listening', function() {
        cs.setBroadcast(true);

        var port = cs.address().port;
        var now = new Date();
        var starttime = now.getTime();

        var timezone = now.getTimezoneOffset() / -3600;
        var packet = Buffer.alloc(0x30, 0);

        var year = now.getYear();

        if (timezone < 0) {
            packet[0x08] = 0xff + timezone - 1;
            packet[0x09] = 0xff;
            packet[0x0a] = 0xff;
            packet[0x0b] = 0xff;
        } else {
            packet[0x08] = timezone;
            packet[0x09] = 0;
            packet[0x0a] = 0;
            packet[0x0b] = 0;
        }
        packet[0x0c] = year & 0xff;
        packet[0x0d] = year >> 8;
        packet[0x0e] = now.getMinutes();
        packet[0x0f] = now.getHours();
        var subyear = year % 100;
        packet[0x10] = subyear;
        packet[0x11] = now.getDay();
        packet[0x12] = now.getDate();
        packet[0x13] = now.getMonth();
        packet[0x18] = parseInt(address[0]);
        packet[0x19] = parseInt(address[1]);
        packet[0x1a] = parseInt(address[2]);
        packet[0x1b] = parseInt(address[3]);
        packet[0x1c] = port & 0xff;
        packet[0x1d] = port >> 8;
        packet[0x26] = 6;
        var checksum = 0xbeaf;

        for (var i = 0; i < packet.length; i++) {
            checksum += packet[i];
        }
        checksum = checksum & 0xffff;
        packet[0x20] = checksum & 0xff;
        packet[0x21] = checksum >> 8;

        cs.sendto(packet, 0, packet.length, 80, '255.255.255.255');

    });

    cs.on("message", (msg, rinfo) => {
        var host = rinfo;

        var mac = Buffer.alloc(6, 0);
        msg.copy(mac, 0x00, 0x3F);
        msg.copy(mac, 0x01, 0x3E);
        msg.copy(mac, 0x02, 0x3D);
        msg.copy(mac, 0x03, 0x3C);
        msg.copy(mac, 0x04, 0x3B);
        msg.copy(mac, 0x05, 0x3A);

        var devtype = msg[0x34] | msg[0x35] << 8;
        if (!this.devices) {
            this.devices = {};
        }

        if (!this.devices[mac]) {
            var dev = this.genDevice(devtype, host, mac);
            if (dev) {
                this.devices[mac] = dev;
                dev.on("deviceReady", () => { this.emit("deviceReady", dev); });
                dev.auth();
            }
        }
    });

    cs.on('close', function() {
        //console.log('===Server Closed');
    });

    cs.bind();

    setTimeout(function() {
        cs.close();
    }, 300);
}

function device(host, mac, timeout = 10) {
    this.host = host;
    this.mac = mac;
    this.emitter = new EventEmitter();
    this.once = this.emitter.once;
    this.on = this.emitter.on;
    this.emit = this.emitter.emit;
    this.removeListener = this.emitter.removeListener;

    this.timeout = timeout;
    this.count = Math.random() & 0xffff;
    this.key = new Buffer([0x09, 0x76, 0x28, 0x34, 0x3f, 0xe9, 0x9e, 0x23, 0x76, 0x5c, 0x15, 0x13, 0xac, 0xcf, 0x8b, 0x02]);
    this.iv = new Buffer([0x56, 0x2e, 0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58]);
    this.id = new Buffer([0, 0, 0, 0]);
    this.cs = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.cs.on('listening', function() {
        //this.cs.setBroadcast(true);
    });
    this.cs.on("message", (response, rinfo) => {
        var enc_payload = Buffer.alloc(response.length - 0x38, 0);
        response.copy(enc_payload, 0, 0x38);
        
        var decipher = crypto.createDecipheriv('aes-128-cbc', this.key, this.iv);
        decipher.setAutoPadding(false);
        var payload = decipher.update(enc_payload);
        try{
            var p2 = decipher.final();
        } catch (e){}
        
        if (p2) {
            payload = Buffer.concat([payload, p2]);
        }

        if (!payload) {
            return false;
        }

        var command = response[0x26];
        var err = response[0x22] | (response[0x23] << 8);

        if (err != 0) return;

        if (command == 0xe9) {
            this.key = Buffer.alloc(0x10, 0);
            payload.copy(this.key, 0, 0x04, 0x14);

            this.id = Buffer.alloc(0x04, 0);
            payload.copy(this.id, 0, 0x00, 0x04);
            this.emit("deviceReady");
        } else if (command == 0xee) {
            this.emit("payload", err, payload);
        }

    });
    this.cs.bind();
    this.type = "Unknown";

}

device.prototype.auth = function() {
    var payload = Buffer.alloc(0x50, 0);
    payload[0x04] = 0x31;
    payload[0x05] = 0x31;
    payload[0x06] = 0x31;
    payload[0x07] = 0x31;
    payload[0x08] = 0x31;
    payload[0x09] = 0x31;
    payload[0x0a] = 0x31;
    payload[0x0b] = 0x31;
    payload[0x0c] = 0x31;
    payload[0x0d] = 0x31;
    payload[0x0e] = 0x31;
    payload[0x0f] = 0x31;
    payload[0x10] = 0x31;
    payload[0x11] = 0x31;
    payload[0x12] = 0x31;
    payload[0x1e] = 0x01;
    payload[0x2d] = 0x01;
    payload[0x30] = 'T'.charCodeAt(0);
    payload[0x31] = 'e'.charCodeAt(0);
    payload[0x32] = 's'.charCodeAt(0);
    payload[0x33] = 't'.charCodeAt(0);
    payload[0x34] = ' '.charCodeAt(0);
    payload[0x35] = ' '.charCodeAt(0);
    payload[0x36] = '1'.charCodeAt(0);

    this.sendPacket(0x65, payload);

}

device.prototype.exit = function() {
    var self = this;
    setTimeout(function() {
        self.cs.close();
    }, 500);
}

device.prototype.getType = function() {
    return this.type;
}

device.prototype.sendPacket = function(command, payload) {
    this.count = (this.count + 1) & 0xffff;
    var packet = Buffer.alloc(0x38, 0);
    packet[0x00] = 0x5a;
    packet[0x01] = 0xa5;
    packet[0x02] = 0xaa;
    packet[0x03] = 0x55;
    packet[0x04] = 0x5a;
    packet[0x05] = 0xa5;
    packet[0x06] = 0xaa;
    packet[0x07] = 0x55;
    packet[0x24] = 0x2a;
    packet[0x25] = 0x27;
    packet[0x26] = command;
    packet[0x28] = this.count & 0xff;
    packet[0x29] = this.count >> 8;
    packet[0x2a] = this.mac[0];
    packet[0x2b] = this.mac[1];
    packet[0x2c] = this.mac[2];
    packet[0x2d] = this.mac[3];
    packet[0x2e] = this.mac[4];
    packet[0x2f] = this.mac[5];
    packet[0x30] = this.id[0];
    packet[0x31] = this.id[1];
    packet[0x32] = this.id[2];
    packet[0x33] = this.id[3];

    var checksum = 0xbeaf;
    for (var i = 0; i < payload.length; i++) {
        checksum += payload[i];
        checksum = checksum & 0xffff;
    }

    var cipher = crypto.createCipheriv('aes-128-cbc', this.key, this.iv);
    payload = cipher.update(payload);
    var p2 = cipher.final();

    packet[0x34] = checksum & 0xff;
    packet[0x35] = checksum >> 8;

    packet = Buffer.concat([packet, payload]);

    checksum = 0xbeaf;
    for (var i = 0; i < packet.length; i++) {
        checksum += packet[i];
        checksum = checksum & 0xffff;
    }
    packet[0x20] = checksum & 0xff;
    packet[0x21] = checksum >> 8;
    //console.log("dev send packet to " + this.host.address + ":" + this.host.port);
    this.cs.sendto(packet, 0, packet.length, this.host.port, this.host.address);
}

device.prototype.s1c = function() {
    this.type = "S1C";

    this.get_sensors_status = function(callback) {
        //"""Returns the sensors state of the s1c"""
        var packet = Buffer.alloc(16, 0);
        packet[0] = 0x06
        this.sendPacket(0x6a, packet);

        this.once("payload", (err, payload) => {
            //console.log("payload: " + payload);
            if (payload[0] == 6){
                    var count = payload[4];
                    var j, k, sensors;
                    sensors = [];
                    for (j = 0; j < count; j++) {
                        var sensor = {};
                        switch (payload[(j*83) + 3 + 6]){
                            case 33:
                                sensor.type = "Motion Sensor";
                                break;
                            case 49:
                                sensor.type = "Door Sensor";
                                break;
                        }
                        switch (payload[(j*83) + 6]){
                            case 0:
                                sensor.status = 0;
                                break;
                            case 128:
                                sensor.status = 0;
                                break;
                            case 16:
                                sensor.status = 1;
                                break;
                            case 144:
                                sensor.status = 1;
                                break;
                        }
                        sensor.name = Buffer.alloc(22, 0);
                        for (var i=4; i < 26; i++){
                            sensor.name[i-4] = payload[(j*83)+i+6]
                        }
                        sensor.name = sensor.name.toString('utf8').replace(/\0/g, '');
                        
                        var sensorSerial = Buffer.alloc(4, 0);
                        for (var i=26; i < 30; i++){
                            sensorSerial[i-26] = payload[(j*83)+i+6]
                        }
                        sensor.serial = unescape(encodeURIComponent(sensorSerial))
                            .split('').map(function(v){
                                return v.charCodeAt(0).toString(16)
                            }).join('')
                        sensors.push(sensor);
                    }
                    var results = {
                        'count': count,
                        'sensors': sensors
                    }
                    callback(results);
                }
        });

    }


    this.get_alarm_status = function(callback) {
        //"""Returns the sensors state of the s1c"""
        var packet = Buffer.alloc(16, 0);
        packet[0] = 0x12;
        this.sendPacket(0x6a, packet);

        this.once("payload", (err, payload) => {
            //console.log("payload: " + payload);
            if (payload[0] == 18){
                var status;
                switch(payload[4]){
                    case 0:
                        status = "Cancel Alarm";
                        break;
                    case 1:
                        status = "Part-Arm";
                        break;
                    case 2:
                        status = "Full-Arm";
                        break;  
                }
                callback(status);
            }
        })
    }

    this.get_trigger_status = function() {
        //"""Returns the sensors state of the s1c"""
        var packet = Buffer.alloc(16, 0);
        packet[0] = 0x10;
        this.sendPacket(0x6a, packet);

        this.once("payload", (err, payload) => {
            //console.log("payload: " + payload);
            if (payload[0] == 16){
                var triggered = false;
                for (var i=1; i<=16; i++){
                     if (payload[i*2+4] ==  1){
                        triggered = true;
                     };
                     //console.log("sensor "+ (i) +" - " + payload[i*2+4])
                } 
                callback(triggered);
            }
        })
    }
    
    this.set_state = function(state, notification_sound, alarm_sound) {
        var packet = Buffer.alloc(16, 0);
        packet[0] = 0x11;
        switch (state){
            case "full_arm":
                packet[4] = 0x02;
                break;
            case "part_arm":
                packet[4] = 0x01;
                break;
            case "disarm":
                packet[4] = 0x00;
                break;
        }
        if (!notification_sound){
                packet[13] = 0x02;
        }
        if (!alarm_sound){
                packet[10] = 0x01;
        }
        
        this.sendPacket(0x6a, packet);
    }
}
