'use strict';

var turboCarto = require('turbo-carto');
var PostgresDatasource = require('./postgres-datasource');

function TurboCartoParser (pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = TurboCartoParser;

TurboCartoParser.prototype.process = function (username, cartocss, sql, callback) {
    var datasource = new PostgresDatasource(this.pgQueryRunner, username, sql);
    turboCarto(cartocss, datasource, callback);
};
