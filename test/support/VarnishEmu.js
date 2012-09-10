var net = require('net');

module.exports = function(on_cmd_recieved, test_callback) {
    var self = this;
    var welcome_msg = 'hi, im a varnish emu, right?';

    self.commands_recieved = [];

    var server = net.createServer(function (socket) {
      var command = '';
      socket.write("200 " + welcome_msg.length + "\n");
      socket.write(welcome_msg);
      socket.on('data', function(data) {
        self.commands_recieved.push(data);
        on_cmd_recieved && on_cmd_recieved(self.commands_recieved);
        socket.write('200 0\n');
      });
    });
    server.listen(1337, "127.0.0.1");

    server.on('listening', function(){
      test_callback();
    });
};

