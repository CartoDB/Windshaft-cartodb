'use strict';

const initDbContext = require('./init_context');
const setConfigurationFromContext = require('./set_configuration_from_context');
const checkConfigurationIsCorrect = require('./check_configuration_is_correct');
const addHTTPHeaders = require('./add_http_headers');

module.exports = () => [
    initDbContext(),
    setConfigurationFromContext(),
    checkConfigurationIsCorrect(),
    addHTTPHeaders(),
  ];
