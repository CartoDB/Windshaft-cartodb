{"version":"1.0.1",
	"layers":[{
    "type":"torque",
	  "options":{
      "sql":"select 1 as id, ST_SetSRID(ST_MakePoint(0,0),3857) as the_geom_webmercator",
	    "cartocss":"Map{ -torque-time-attribute:'id'; -torque-aggregation-function:'count(id)'; -torque-frame-count:2; -torque-resolution:2}",
      "cartocss_version": "2.1.1"
    }
  }]
}
