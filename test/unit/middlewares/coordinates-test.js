'use strict';

const assert = require('assert');
const coordinates = require('../../../lib/api/middlewares/coordinates');

describe('coordinates middleware', function () {
    it('should return error: invalid zoom paramenter (-1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '-1',
                x: '0',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid zoom value (-1). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should return error: invalid zoom paramenter (1.1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1.1',
                x: '0',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid zoom value (1.1). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should return error: invalid zoom paramenter (0.1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '0.1',
                x: '0',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid zoom value (0.1). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should return error: invalid zoom paramenter (wadus)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: 'wadus',
                x: '0',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid zoom value (wadus). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should NOT return error: \'zoom\' paramenter (1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: '1',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.ifError(err);
            done();
        });
    });

    it('should return error: invalid coordinate \'x\' paramenter (1.1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: '1.1',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(err.message, 'Invalid coodinate \'x\' value (1.1). It should be an integer number');
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should return error: invalid coordinate \'x\' paramenter (wadus)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: 'wadus',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(err.message, 'Invalid coodinate \'x\' value (wadus). It should be an integer number');
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should NOT return error: \'x\' paramenter (-1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: '-3',
                y: '0'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.ifError(err);
            done();
        });
    });

    it('should return error: invalid coordinate \'y\' paramenter (-1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: '0',
                y: '-1'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid coodinate \'y\' value (-1). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should return error: invalid coordinate \'y\' paramenter (1.1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: '0',
                y: '1.1'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid coodinate \'y\' value (1.1). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should return error: invalid coordinate \'y\' paramenter (wadus)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: '0',
                y: 'wadus'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid coodinate \'y\' value (wadus). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });

    it('should NOT return error: \'y\' paramenter (1)', function (done) {
        const coords = coordinates();
        const req = {
            params: {
                z: '1',
                x: '1',
                y: '1'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.ifError(err);
            done();
        });
    });

    it('should validate zoom and should return error: invalid zoom paramenter (-1.1)', function (done) {
        const coords = coordinates({ z: true, x: false, y: false });
        const req = {
            params: {
                z: '-1.1'
            }
        };
        const res = {};

        coords(req, res, function (err) {
            assert.strictEqual(
                err.message,
                'Invalid zoom value (-1.1). It should be an integer number greather than or equal to 0'
            );
            assert.strictEqual(err.http_status, 400);
            done();
        });
    });
});
