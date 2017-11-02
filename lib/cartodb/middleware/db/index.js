'use strict';

const initDbContext = require('./init_context');
const setConfigurationFromContext = require('./set_configuration_from_context');

module.exports = () => [
    initDbContext(),
    setConfigurationFromContext(),
  ];
