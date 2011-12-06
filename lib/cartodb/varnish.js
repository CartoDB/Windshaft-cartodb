
/**
 * this module implements varnish telnet management protocol
 * https://www.varnish-cache.org/trac/wiki/ManagementPort
 */

var net = require('net')

function VarnishClient(host, port, ready_callback) {

    var self = this;
    var ready = false;
    var cmd_callback = null;
    var client = null;

    function connect() {
        ready = false;
        client = net.createConnection(port, host);
    }

    connect();

    client.on('data', function(data) {
        data = data.toString();
        lines = data.split('\n', 2);
        if(lines.length == 2) {
            var tk = lines[0].split(' ')
            var code = parseInt(tk[0], 10);
            var body_length = parseInt(tk[1], 10);
            var body = lines[1];
            if(!ready) {
                ready = true;
                ready_callback();
            } else if(cmd_callback) {
                var c = cmd_callback
                cmd_callback = null;
                c(null, code, body);
            }
        }

    });

    client.on('error', function(err) {
        console.log("[ERROR] some problem in varnish connection");
    });

    client.on('close', function() {
        self.close();
    });

    // sends the command to the server
    function _send(cmd, callback) {
      cmd_callback = callback;

      // If varnish down attempt simple reconnect
      try{
        client.write(cmd + '\n');
      } catch(err) {
        self.close();
        connect();
        ready=true;
        ready_callback();
        client.write(cmd + '\n');
      }
    }

    // run command if there is no peding response
    // fist param of the callback are the error, null
    // if all went ok
    this.run_cmd = function(cmd, callback) {
       if(!cmd_callback) {
         _send(cmd, callback);
       } else {
         callback('response pending');
       }
    }

    // close the connection
    this.close = function() {
       client.end();
       ready = false; 
    }

}


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

    var MAX_QUEUE = 2000;
    var queue = [];
    var ready = false;

    var client = new VarnishClient(host, port, function(err) {
        ready = true;
        _send_pending();
    });

    function _send_pending(empty_callback) {
        var c = queue.pop();
        if(!c) return;
        client.run_cmd(c, function() {
            if(queue.length > 0) {
                process.nextTick(_send_pending);
            } else {
                if(empty_callback) {
                    empty_callback();
                }
            }
        });
    }

    this.run_cmd = function(cmd) {
        queue.push(cmd);
        if(queue.length > MAX_QUEUE) {
            console.log("varnish commando queu too long, removing commands");
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
