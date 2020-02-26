'use strict';

const EVENT_VERSION = '1';
const MAX_LENGTH = 100;

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
    const event = normalizedField(req.get('Carto-Event'));
    const eventSource = normalizedField(req.get('Carto-Event-Source'));
    const eventGroupId = normalizedField(req.get('Carto-Event-Group-Id'));

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

function normalizedField (field) {
    return field.toString().substr(0, MAX_LENGTH);
}

module.exports = pubSubMetrics;
