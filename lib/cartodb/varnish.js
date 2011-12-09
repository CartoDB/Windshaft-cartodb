
/**
 * this module implements varnish telnet management protocol
 * https://www.varnish-cache.org/trac/wiki/ManagementPort
 */

var net = require('net')
var EventEmitter = require('events').EventEmitter;

function VarnishClient(host, port, ready_callback) {

    var self = this;
    var ready = false;
    var cmd_callback = null;
    var client = null;
    var connected = false;
    var connecting = false;

    function log() {
        console.log.apply(console, arguments);
    }

    function connect() {
        if(connecting || connected ) return;
        connecting = true;
        log("VARNISH: connection");
        ready = false;
        if(!client) {
            client = net.createConnection(port, host);
            client.on('connect', function () {
                log("VARNISH: connected");
                connected = true;
                self.emit('connect');
                connecting = false;
            });
        } else {
            client.connect(port, host);
        }
    }
    self.connect = connect;


    connect();

    client.on('data', function (data) {
        data = data.toString();
        lines = data.split('\n', 2);
        if(lines.length == 2) {
            var tk = lines[0].split(' ')
            var code = parseInt(tk[0], 10);
            var body_length = parseInt(tk[1], 10);
            var body = lines[1];
            if(!ready) {
                ready = true;
                ready_callback && ready_callback();
                self.emit('ready');
            } else if(cmd_callback) {
                var c = cmd_callback
                cmd_callback = null;
                c(null, code, body);
                self.emit('response', code, body)
            }
        }

    });

    client.on('error', function(err) {
        log("[ERROR] some problem in varnish connection", err);
        self.emit('error', err);
    });

    client.on('close', function(e) {
        log("[INFO] closed varnish connection");
        self.close();
        connected = false;
        connecting = false;
    });

    // sends the command to the server
    function _send(cmd, callback) {
      cmd_callback = callback;
      if(connected) {
        client.write(cmd + '\n');
      } else {
        connect();
      }
    }

    // run command if there is no peding response
    // fist param of the callback are the error, null
    // if all went ok
    this.run_cmd = function(cmd, callback) {
       if(!connected) {
           connect();
       }
       if(!cmd_callback) {
         _send(cmd, callback);
       } else {
         callback('response pending');
         self.emit('error', {
            code: 'RESPONSE_PENDING',
            message: 'there is a response pending'
         });
       }
    }

    // close the connection
    this.close = function() {
       client.end();
       ready = false; 
       self.emit('close');
    }

}

VarnishClient.prototype = new EventEmitter();


function VarnishPool(opts, ready) {
    var resources = [];
    var available = [];

    for(var i = 0; i < opts.pool_size; ++i) {
        var v = new VarnishClient(opts.host, opts.port, function() {
            resources.push(v);
            available.push(v);
        });
    }

    this.run_cmd = function(cmd, callback) {
        var v = available.pop()
        if(v) {
            v.run_cmd(cmd, function(err, status_code, body) {
                callback(err, status_code, body);
                available.push(v);
                ready();
            });
        } else {
            callback('no clients available');
        }
    }

    this.close = function() {
        for(var i = 0; i < resources.length; ++i) {
            resources[i].close();
        }
    }
}

function VarnishQueue(host, port) {

    var self = this;
    var MAX_QUEUE = 2000;
    var queue = [];
    var ready = false;
    var reconnectTimer = null;
    var reconnectTries = 0;
    var MAX_RECONNECT_TRIES = 120; // 2 minutes

    var client = new VarnishClient(host, port);

    function log() {
        console.log.apply(console, arguments);
    }

    // attach a dummy callback to error event to avoid nodejs throws an exception and closes the process
    self.on('error', function(e) {
        log("error", e);
    });

    client.on('connect', function() {
        clearInterval(reconnectTimer);
        reconnectTries = 0;
    });

    client.on('ready', function() {
        ready = true;
        log('sending pending');
        _send_pending();
    });

    function reconnect() {
        ready = false;
        clearInterval(reconnectTimer);
        reconnectTimer = setInterval(function() {
            client.connect();
            ++reconnectTries;
            if(reconnectTries >= MAX_RECONNECT_TRIES) {
                self.emit('error', {
                    code: 'ABORT_RECONNECT',
                    message: 'max reconnect tries, abouting'
                });
                clearInterval(reconnectTimer);
            }
        }, 1000);
    }
    client.on('close', reconnect);
    client.on('error', reconnect);

    function _send_pending(empty_callback) {
        if(!ready) return;
        var c = queue.pop();
        if(!c) return;
        client.run_cmd(c, function() {
            if(queue.length > 0) {
                process.nextTick(_send_pending);
            } else {
                if(empty_callback) {
                    empty_callback();
                }
                self.emit('empty');
            }
        });
    }

    this.run_cmd = function(cmd) {
        queue.push(cmd);
        if(queue.length > MAX_QUEUE) {
            console.log("varnish command queue too long, removing commands");
            self.emit('error', {code: 'TOO_LONG', message: "varnish command queue too long, removing commands"});
            queue.pop();
        }
        if(ready) {
            _send_pending();
        }
    }

    this.end = function() {
        _send_pending(function() {
            client.close();
        });
    }

}

VarnishQueue.prototype = new EventEmitter();

/*
var queue = new VarnishQueue('localhost', 6082)
setInterval(function() {
    queue.run_cmd('purge obj.http.url == /')
}, 10)
*/
/*
v = new VarnishClient('localhost', 6082, function(err) {
    console.log('connected');
    v.run_cmd('purge obj.http.url == /', function(err, code, body) {
        console.log(code);
        console.log(body);
        v.close();
    });
});

pool = new VarnishPool({
    host: 'locahost',
    port: 6082,
    pool_size: 5
});
/*
v.close();
*/

module.exports = {
    VarnishClient: VarnishClient,
    VarnishQueue: VarnishQueue
}
