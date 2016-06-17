'use strict';


function appendToHeader(currentValue, newValue) {
    if (!!currentValue) {
        newValue = currentValue + ',' + newValue;
    }
    return newValue;
}

function tag(response, requestType) {
    response.set('X-Map-Request-Type', appendToHeader(
        response.get('X-Map-Request-Type'),
        Array.isArray(requestType) ? requestType.join(',') : requestType
    ));
}

function tagger(requestType) {
    return function(req, res, next) {
        tag(res, requestType);
        next();
    };
}

module.exports = tagger;
module.exports.tag = tag;
