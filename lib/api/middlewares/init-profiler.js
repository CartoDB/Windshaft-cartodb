'use strict';

module.exports = function initProfiler (isTemplateInstantiation) {
    const operation = isTemplateInstantiation ? 'instance_template' : 'createmap';

    return function initProfilerMiddleware (req, res, next) {
        req.profiler.start(`windshaft-cartodb.${operation}_${req.method.toLowerCase()}`);
        req.profiler.done(`${operation}.initProfilerMiddleware`);
        next();
    };
};
