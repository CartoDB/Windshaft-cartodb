'use strict';

const EVENT_VERSION = '1';

function pubSubMetrics (pubSubMetricsBackend) {
    if (!pubSubMetricsBackend.isEnabled()) {
        return function pubSubMetricsDisabledMiddleware (req, res, next) { next(); };
    }

    return function pubSubMetricsMiddleware (req, res, next) {
        const data = getEventData(req, res);

        if (data.event) {
            pubSubMetricsBackend.sendEvent(data.event, data.attributes);
        }

        return next();
    };
}

function getEventData (req, res) {
    const event = req.get('Carto-Event');
    const eventSource = req.get('Carto-Event-Source');
    const eventGroupId = req.get('Carto-Event-Group-Id');

    if (!event || !eventSource) {
        return [undefined, undefined];
    }

    const attributes = {
        event_source: eventSource,
        user_id: res.locals.userId,
        response_code: res.statusCode.toString(),
        source_domain: req.hostname,
        event_time: new Date().toISOString(),
        event_version: EVENT_VERSION
    };

    if (eventGroupId) {
        attributes.event_group_id = eventGroupId;
    }

    return { event, attributes };
}

module.exports = pubSubMetrics;
