var assert      = require('assert');
var net = require('net');
require(__dirname + '/../test_helper');
var varnish = require(__dirname + '/../../lib/cartodb/varnish');
var tests = module.exports = {};

function VarnishEmu(on_cmd_recieved, port) {
    var self = this;
    var welcome_msg = 'hi, im a varnish emu, right?';

    self.commands_recieved = [];

    var sockets = [];
    var server = net.createServer(function (socket) {
      var command = '';
      socket.write("200 " + welcome_msg.length + "\n");
      socket.write(welcome_msg);
      socket.on('data', function(data) {
        self.commands_recieved.push(data);
        server.commands++;
        on_cmd_recieved && on_cmd_recieved(self.commands_recieved);
        socket.write('200 0\n');
      });
      sockets.push(socket);
    });
    server.commands = 0;
    server.listen(port || 0, "127.0.0.1");
    server.close_connections = function() {
        for(var s in sockets) {
            sockets[s].end();
        }
    };
    return server;
}

tests['ok'] = function() {
    assert.ok(true);
};

tests['should connect'] = function() {
    var ok = false;
    var server = VarnishEmu();
    server.on('listening', function() {
        var client = new varnish.VarnishClient('127.0.0.1', server.address().port);
        client.on('connect', function() {
            ok = true;
        });
    });
    setTimeout(function() { assert.ok(ok); 
        server.close();
    }, 200);
};

tests['should send a command'] = function() {
    var ok = false;
    var server = VarnishEmu(function() {
        ok = true;
    });
    server.on('listening', function() {
        var client = new varnish.VarnishClient('127.0.0.1', server.address().port);
        client.on('ready', function() {
            client.run_cmd('purge obj.http.X == test', function(){});
        });
    });
    setTimeout(function() { assert.ok(ok); }, 100);
}

tests['should emit close on server disconect'] = function() {
    var ok = false;
    var server = VarnishEmu();
    server.on('listening', function() {
        var client = new varnish.VarnishClient('127.0.0.1', server.address().port);
        client.on('ready', function() {
            client.on('close', function() { ok = true; });
            server.close_connections();
            server.close();
        });
    });
    setTimeout(function() { assert.ok(ok); }, 300);
}

tests['should emit response on command'] = function() {
    var ok = false;
    var server = VarnishEmu()
    server.on('listening', function() {
        var client = new varnish.VarnishClient('127.0.0.1', server.address().port);
        client.on('ready', function() {
            client.run_cmd('purge obj.http.X == test', function(){});
            client.on('response', function(code, body) {
                ok = true;
                assert.equal(200, code);
            });
        });
    });
    setTimeout(function() { assert.ok(ok); }, 100);
}

tests['should emit error when the user tries to send when thereis a pending command'] = function() {
    var ok = false;
    var server = VarnishEmu()
    server.on('listening', function() {
        var client = new varnish.VarnishClient('127.0.0.1', server.address().port);
        client.on('ready', function() {
            client.run_cmd('purge obj.http.X == test', function(){});
            client.on('error', function(e) {
                ok = true;
                assert.equal('RESPONSE_PENDING', e.code);
            });
            client.run_cmd('purge obj.http.X == test', function(){});
        });
    });
    setTimeout(function() { assert.ok(ok); }, 100);
};


//
// queue
//

tests['should send command'] = function() {
    var server = VarnishEmu()
    server.on('listening', function() {
        var queue = new varnish.VarnishQueue('127.0.0.1', server.address().port);
        for(var i = 0; i < 5; ++i) {
            queue.run_cmd('purge simon_is == gay');
        }
    });
    setTimeout(function() { assert.equal(5, server.commands); }, 100);
}

tests['should send commands on connect'] = function() {
    // first create queue
    var queue = new varnish.VarnishQueue('127.0.0.1', 1234)
    for(var i = 0; i < 5; ++i) {
        queue.run_cmd('purge simon_is == gay');
    }
    // then server
    var server = VarnishEmu(null, 1234)
    setTimeout(function() { assert.equal(5, server.commands); }, 1000);
}

