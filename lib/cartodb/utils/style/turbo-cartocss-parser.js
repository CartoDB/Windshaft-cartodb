'use strict';

var turboCartoCss = require('turbo-cartocss');
var PostgresDatasource = require('./postgres-datasource');

function TurboCartocssParser (pgQueryRunner) {
    this.pgQueryRunner = pgQueryRunner;
}

module.exports = TurboCartocssParser;

TurboCartocssParser.prototype.process = function (username, cartocss, sql, callback) {
    var datasource = new PostgresDatasource(this.pgQueryRunner, username, sql);
    turboCartoCss(cartocss, datasource, callback);
};
