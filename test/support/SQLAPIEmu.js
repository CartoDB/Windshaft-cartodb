var http        = require('http');
var url         = require('url');

var o = function(port, cb) {

  this.sqlapi_server = http.createServer(function(req,res) {
        var query = url.parse(req.url, true).query;
        if ( query.q.match('SQLAPIERROR') ) {
          res.statusCode = 400;
          res.write(JSON.stringify({'error':'Some error occurred'}));
        } else {
          var qs = JSON.stringify(query);
          var row = {
            // This is the structure of the known query sent by tiler
            'cdb_querytables': '{' + qs + '}',
            'max': qs
          };
          res.write(JSON.stringify({rows: [ row ]}));
        }
        res.end();
   }).listen(port, cb);
};

o.prototype.close = function(cb) {
  this.sqlapi_server.close(cb);
};

module.exports = o;

