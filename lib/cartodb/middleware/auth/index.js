'use strict';

const initAuthContext = require('./init_context');
const apiKeyTokenGetter = require('./get_api_key_token');
const authorize = require('./authorize');

module.exports = ({metadataBackend}) => [
    initAuthContext(),
    apiKeyTokenGetter(),
    authorize({metadataBackend}),
  ];
