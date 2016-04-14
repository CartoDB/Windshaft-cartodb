--
-- Windshaft test database
--
-- To use run ../prepare_db.sh
-- NOTE: requires a postgis template called template_postgis
--

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = off;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET escape_string_warning = off;
SET search_path = public, pg_catalog;
SET default_tablespace = '';
SET default_with_oids = false;

-- public user role
DROP USER IF EXISTS :PUBLICUSER;
CREATE USER :PUBLICUSER WITH PASSWORD ':PUBLICPASS';

-- db owner role
DROP USER IF EXISTS :TESTUSER;
CREATE USER :TESTUSER WITH PASSWORD ':TESTPASS';

-- first table
CREATE TABLE test_table (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry,
    CONSTRAINT enforce_dims_the_geom CHECK ((st_ndims(the_geom) = 2)),
    CONSTRAINT enforce_dims_the_geom_webmercator CHECK ((st_ndims(the_geom_webmercator) = 2)),
    CONSTRAINT enforce_geotype_the_geom CHECK (((geometrytype(the_geom) = 'POINT'::text) OR (the_geom IS NULL))),
    CONSTRAINT enforce_geotype_the_geom_webmercator CHECK (((geometrytype(the_geom_webmercator) = 'POINT'::text) OR (the_geom_webmercator IS NULL))),
    CONSTRAINT enforce_srid_the_geom CHECK ((st_srid(the_geom) = 4326)),
    CONSTRAINT enforce_srid_the_geom_webmercator CHECK ((st_srid(the_geom_webmercator) = 3857))
);

CREATE SEQUENCE test_table_cartodb_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE test_table_cartodb_id_seq OWNED BY test_table.cartodb_id;

SELECT pg_catalog.setval('test_table_cartodb_id_seq', 60, true);

ALTER TABLE test_table ALTER COLUMN cartodb_id SET DEFAULT nextval('test_table_cartodb_id_seq'::regclass);

INSERT INTO test_table VALUES
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.314252', 1, 'Hawai', 'Calle de Pérez Galdós 9, Madrid, Spain', '0101000020E6100000A6B73F170D990DC064E8D84125364440', '0101000020110F000076491621312319C122D4663F1DCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.319101', 2, 'El Estocolmo', 'Calle de la Palma 72, Madrid, Spain', '0101000020E6100000C90567F0F7AB0DC0AB07CC43A6364440', '0101000020110F0000C4356B29423319C15DD1092DADCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.324', 3, 'El Rey del Tallarín', 'Plaza Conde de Toreno 2, Madrid, Spain', '0101000020E610000021C8410933AD0DC0CB0EF10F5B364440', '0101000020110F000053E71AC64D3419C10F664E4659CC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.329509', 4, 'El Lacón', 'Manuel Fernández y González 8, Madrid, Spain', '0101000020E6100000BC5983F755990DC07D923B6C22354440', '0101000020110F00005DACDB056F2319C1EC41A980FCCA5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.334931', 5, 'El Pico', 'Calle Divino Pastor 12, Madrid, Spain', '0101000020E61000003B6D8D08C6A10DC0371B2B31CF364440', '0101000020110F00005F716E91992A19C17DAAA4D6DACC5241');

ALTER TABLE ONLY test_table ADD CONSTRAINT test_table_pkey PRIMARY KEY (cartodb_id);

CREATE INDEX test_table_the_geom_idx ON test_table USING gist (the_geom);
CREATE INDEX test_table_the_geom_webmercator_idx ON test_table USING gist (the_geom_webmercator);

GRANT ALL ON TABLE test_table TO :TESTUSER;
GRANT SELECT ON TABLE test_table TO :PUBLICUSER;

-- second table
CREATE TABLE test_table_2 (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry,
    CONSTRAINT enforce_dims_the_geom CHECK ((st_ndims(the_geom) = 2)),
    CONSTRAINT enforce_dims_the_geom_webmercator CHECK ((st_ndims(the_geom_webmercator) = 2)),
    CONSTRAINT enforce_geotype_the_geom CHECK (((geometrytype(the_geom) = 'POINT'::text) OR (the_geom IS NULL))),
    CONSTRAINT enforce_geotype_the_geom_webmercator CHECK (((geometrytype(the_geom_webmercator) = 'POINT'::text) OR (the_geom_webmercator IS NULL))),
    CONSTRAINT enforce_srid_the_geom CHECK ((st_srid(the_geom) = 4326)),
    CONSTRAINT enforce_srid_the_geom_webmercator CHECK ((st_srid(the_geom_webmercator) = 3857))
);

CREATE SEQUENCE test_table_2_cartodb_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE test_table_2_cartodb_id_seq OWNED BY test_table_2.cartodb_id;

SELECT pg_catalog.setval('test_table_2_cartodb_id_seq', 60, true);

ALTER TABLE test_table_2 ALTER COLUMN cartodb_id SET DEFAULT nextval('test_table_2_cartodb_id_seq'::regclass);

INSERT INTO test_table_2 VALUES
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.314252', 1, 'Hawai', 'Calle de Pérez Galdós 9, Madrid, Spain', '0101000020E6100000A6B73F170D990DC064E8D84125364440', '0101000020110F000076491621312319C122D4663F1DCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.319101', 2, 'El Estocolmo', 'Calle de la Palma 72, Madrid, Spain', '0101000020E6100000C90567F0F7AB0DC0AB07CC43A6364440', '0101000020110F0000C4356B29423319C15DD1092DADCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.324', 3, 'El Rey del Tallarín', 'Plaza Conde de Toreno 2, Madrid, Spain', '0101000020E610000021C8410933AD0DC0CB0EF10F5B364440', '0101000020110F000053E71AC64D3419C10F664E4659CC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.329509', 4, 'El Lacón', 'Manuel Fernández y González 8, Madrid, Spain', '0101000020E6100000BC5983F755990DC07D923B6C22354440', '0101000020110F00005DACDB056F2319C1EC41A980FCCA5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.334931', 5, 'El Pico', 'Calle Divino Pastor 12, Madrid, Spain', '0101000020E61000003B6D8D08C6A10DC0371B2B31CF364440', '0101000020110F00005F716E91992A19C17DAAA4D6DACC5241');

ALTER TABLE ONLY test_table_2 ADD CONSTRAINT test_table_2_pkey PRIMARY KEY (cartodb_id);

CREATE INDEX test_table_2_the_geom_idx ON test_table_2 USING gist (the_geom);
CREATE INDEX test_table_2_the_geom_webmercator_idx ON test_table_2 USING gist (the_geom_webmercator);

GRANT ALL ON TABLE test_table_2 TO :TESTUSER;
GRANT SELECT ON TABLE test_table_2 TO :PUBLICUSER;

-- third table
CREATE TABLE test_table_3 (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry,
    CONSTRAINT enforce_dims_the_geom CHECK ((st_ndims(the_geom) = 2)),
    CONSTRAINT enforce_dims_the_geom_webmercator CHECK ((st_ndims(the_geom_webmercator) = 2)),
    CONSTRAINT enforce_geotype_the_geom CHECK (((geometrytype(the_geom) = 'POINT'::text) OR (the_geom IS NULL))),
    CONSTRAINT enforce_geotype_the_geom_webmercator CHECK (((geometrytype(the_geom_webmercator) = 'POINT'::text) OR (the_geom_webmercator IS NULL))),
    CONSTRAINT enforce_srid_the_geom CHECK ((st_srid(the_geom) = 4326)),
    CONSTRAINT enforce_srid_the_geom_webmercator CHECK ((st_srid(the_geom_webmercator) = 3857))
);

CREATE SEQUENCE test_table_3_cartodb_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE test_table_3_cartodb_id_seq OWNED BY test_table_3.cartodb_id;

SELECT pg_catalog.setval('test_table_3_cartodb_id_seq', 60, true);

ALTER TABLE test_table_3 ALTER COLUMN cartodb_id SET DEFAULT nextval('test_table_3_cartodb_id_seq'::regclass);

INSERT INTO test_table_3 VALUES
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.314252', 1, 'Hawai', 'Calle de Pérez Galdós 9, Madrid, Spain', '0101000020E6100000A6B73F170D990DC064E8D84125364440', '0101000020110F000076491621312319C122D4663F1DCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.319101', 2, 'El Estocolmo', 'Calle de la Palma 72, Madrid, Spain', '0101000020E6100000C90567F0F7AB0DC0AB07CC43A6364440', '0101000020110F0000C4356B29423319C15DD1092DADCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.324', 3, 'El Rey del Tallarín', 'Plaza Conde de Toreno 2, Madrid, Spain', '0101000020E610000021C8410933AD0DC0CB0EF10F5B364440', '0101000020110F000053E71AC64D3419C10F664E4659CC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.329509', 4, 'El Lacón', 'Manuel Fernández y González 8, Madrid, Spain', '0101000020E6100000BC5983F755990DC07D923B6C22354440', '0101000020110F00005DACDB056F2319C1EC41A980FCCA5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.334931', 5, 'El Pico', 'Calle Divino Pastor 12, Madrid, Spain', '0101000020E61000003B6D8D08C6A10DC0371B2B31CF364440', '0101000020110F00005F716E91992A19C17DAAA4D6DACC5241');

ALTER TABLE ONLY test_table_3 ADD CONSTRAINT test_table_3_pkey PRIMARY KEY (cartodb_id);

CREATE INDEX test_table_3_the_geom_idx ON test_table_3 USING gist (the_geom);
CREATE INDEX test_table_3_the_geom_webmercator_idx ON test_table_3 USING gist (the_geom_webmercator);

GRANT ALL ON TABLE test_table_3 TO :TESTUSER;
GRANT SELECT ON TABLE test_table_3 TO :PUBLICUSER;

-- private table
CREATE TABLE test_table_private_1 (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry,
    CONSTRAINT enforce_dims_the_geom CHECK ((st_ndims(the_geom) = 2)),
    CONSTRAINT enforce_dims_the_geom_webmercator CHECK ((st_ndims(the_geom_webmercator) = 2)),
    CONSTRAINT enforce_geotype_the_geom CHECK (((geometrytype(the_geom) = 'POINT'::text) OR (the_geom IS NULL))),
    CONSTRAINT enforce_geotype_the_geom_webmercator CHECK (((geometrytype(the_geom_webmercator) = 'POINT'::text) OR (the_geom_webmercator IS NULL))),
    CONSTRAINT enforce_srid_the_geom CHECK ((st_srid(the_geom) = 4326)),
    CONSTRAINT enforce_srid_the_geom_webmercator CHECK ((st_srid(the_geom_webmercator) = 3857))
);
INSERT INTO test_table_private_1 SELECT * from test_table;

GRANT ALL ON TABLE test_table_private_1 TO :TESTUSER;

CREATE TABLE IF NOT EXISTS
  CDB_TableMetadata (
    tabname regclass not null primary key,
    updated_at timestamp with time zone not null default now()
  );

INSERT INTO CDB_TableMetadata (tabname, updated_at) VALUES ('test_table'::regclass, '2009-02-13T23:31:30.123Z');
INSERT INTO CDB_TableMetadata (tabname, updated_at) VALUES ('test_table_private_1'::regclass, '2009-02-13T23:31:30.123Z');

-- GRANT SELECT ON CDB_TableMetadata TO :PUBLICUSER;
GRANT SELECT ON CDB_TableMetadata TO :TESTUSER;

-- long name table
CREATE TABLE
long_table_name_with_enough_chars_to_break_querytables_function
(
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry
);

INSERT INTO long_table_name_with_enough_chars_to_break_querytables_function SELECT * from test_table;

ALTER TABLE ONLY long_table_name_with_enough_chars_to_break_querytables_function
    ADD CONSTRAINT long_table_name_with_enough_chars_to_break_querytables_func_pkey PRIMARY KEY (cartodb_id);

CREATE INDEX long_table_name_the_geom_idx
    ON long_table_name_with_enough_chars_to_break_querytables_function USING gist (the_geom);
CREATE INDEX long_table_name_the_geom_webmercator_idx
    ON long_table_name_with_enough_chars_to_break_querytables_function USING gist (the_geom_webmercator);

GRANT ALL ON TABLE long_table_name_with_enough_chars_to_break_querytables_function TO :TESTUSER;
GRANT SELECT ON TABLE long_table_name_with_enough_chars_to_break_querytables_function TO :PUBLICUSER;

INSERT INTO CDB_TableMetadata (tabname, updated_at) VALUES ('long_table_name_with_enough_chars_to_break_querytables_function'::regclass, '2009-02-13T23:31:30.123Z');

CREATE FUNCTION test_table_inserter(geometry, text) returns int AS $$
 INSERT INTO test_table(name, the_geom, the_geom_webmercator)
  SELECT $2, $1, ST_Transform($1, 3857) RETURNING cartodb_id;
$$ LANGUAGE 'sql' SECURITY DEFINER;

CREATE TABLE test_big_poly (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id serial NOT NULL,
    name character varying,
    the_geom geometry(polygon) CHECK ( ST_Srid(the_geom) = 4326 ),
    the_geom_webmercator geometry(polygon) CHECK ( ST_Srid(the_geom_webmercator) = 3857 )
);
INSERT INTO test_big_poly (name, the_geom) VALUES ('west', 'SRID=4326;POLYGON((-180 -80, -180 80, 0 80, 0 -80, -180 -80))');
UPDATE test_big_poly SET the_geom_webmercator = ST_Transform(the_geom, 3857);
CREATE INDEX test_big_poly_the_geom_idx ON test_big_poly USING gist (the_geom);
CREATE INDEX test_big_poly_the_geom_webmercator_idx ON test_big_poly USING gist (the_geom_webmercator);

GRANT ALL ON TABLE test_big_poly TO :TESTUSER;
GRANT SELECT ON TABLE test_big_poly TO :PUBLICUSER;

-- table with overviews

CREATE TABLE test_table_overviews (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry,
    CONSTRAINT enforce_dims_the_geom CHECK ((st_ndims(the_geom) = 2)),
    CONSTRAINT enforce_dims_the_geom_webmercator CHECK ((st_ndims(the_geom_webmercator) = 2)),
    CONSTRAINT enforce_geotype_the_geom CHECK (((geometrytype(the_geom) = 'POINT'::text) OR (the_geom IS NULL))),
    CONSTRAINT enforce_geotype_the_geom_webmercator CHECK (((geometrytype(the_geom_webmercator) = 'POINT'::text) OR (the_geom_webmercator IS NULL))),
    CONSTRAINT enforce_srid_the_geom CHECK ((st_srid(the_geom) = 4326)),
    CONSTRAINT enforce_srid_the_geom_webmercator CHECK ((st_srid(the_geom_webmercator) = 3857))
);

GRANT ALL ON TABLE test_table_overviews TO :TESTUSER;
GRANT SELECT ON TABLE test_table_overviews TO :PUBLICUSER;

CREATE SEQUENCE test_table_overviews_cartodb_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE test_table_overviews_cartodb_id_seq OWNED BY test_table_overviews.cartodb_id;

SELECT pg_catalog.setval('test_table_overviews_cartodb_id_seq', 60, true);

ALTER TABLE test_table_overviews ALTER COLUMN cartodb_id SET DEFAULT nextval('test_table_overviews_cartodb_id_seq'::regclass);

INSERT INTO test_table_overviews VALUES
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.314252', 1, 'Hawai', 'Calle de Pérez Galdós 9, Madrid, Spain', '0101000020E6100000A6B73F170D990DC064E8D84125364440', '0101000020110F000076491621312319C122D4663F1DCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.319101', 2, 'El Estocolmo', 'Calle de la Palma 72, Madrid, Spain', '0101000020E6100000C90567F0F7AB0DC0AB07CC43A6364440', '0101000020110F0000C4356B29423319C15DD1092DADCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.324', 3, 'El Rey del Tallarín', 'Plaza Conde de Toreno 2, Madrid, Spain', '0101000020E610000021C8410933AD0DC0CB0EF10F5B364440', '0101000020110F000053E71AC64D3419C10F664E4659CC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.329509', 4, 'El Lacón', 'Manuel Fernández y González 8, Madrid, Spain', '0101000020E6100000BC5983F755990DC07D923B6C22354440', '0101000020110F00005DACDB056F2319C1EC41A980FCCA5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.334931', 5, 'El Pico', 'Calle Divino Pastor 12, Madrid, Spain', '0101000020E61000003B6D8D08C6A10DC0371B2B31CF364440', '0101000020110F00005F716E91992A19C17DAAA4D6DACC5241');

ALTER TABLE ONLY test_table_overviews ADD CONSTRAINT test_table_overviews_pkey PRIMARY KEY (cartodb_id);

CREATE INDEX test_table_overviews_the_geom_idx ON test_table_overviews USING gist (the_geom);
CREATE INDEX test_table_overviews_the_geom_webmercator_idx ON test_table_overviews USING gist (the_geom_webmercator);

GRANT ALL ON TABLE test_table_overviews TO :TESTUSER;
GRANT SELECT ON TABLE test_table_overviews TO :PUBLICUSER;

CREATE TABLE _vovw_1_test_table_overviews (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry,
    _vovw_count integer,
    CONSTRAINT enforce_dims_the_geom CHECK ((st_ndims(the_geom) = 2)),
    CONSTRAINT enforce_dims_the_geom_webmercator CHECK ((st_ndims(the_geom_webmercator) = 2)),
    CONSTRAINT enforce_geotype_the_geom CHECK (((geometrytype(the_geom) = 'POINT'::text) OR (the_geom IS NULL))),
    CONSTRAINT enforce_geotype_the_geom_webmercator CHECK (((geometrytype(the_geom_webmercator) = 'POINT'::text) OR (the_geom_webmercator IS NULL))),
    CONSTRAINT enforce_srid_the_geom CHECK ((st_srid(the_geom) = 4326)),
    CONSTRAINT enforce_srid_the_geom_webmercator CHECK ((st_srid(the_geom_webmercator) = 3857))
);

GRANT ALL ON TABLE _vovw_1_test_table_overviews TO :TESTUSER;
GRANT SELECT ON TABLE _vovw_1_test_table_overviews TO :PUBLICUSER;

CREATE TABLE _vovw_2_test_table_overviews (
    updated_at timestamp without time zone DEFAULT now(),
    created_at timestamp without time zone DEFAULT now(),
    cartodb_id integer NOT NULL,
    name character varying,
    address character varying,
    the_geom geometry,
    the_geom_webmercator geometry,
    _vovw_count integer,
    CONSTRAINT enforce_dims_the_geom CHECK ((st_ndims(the_geom) = 2)),
    CONSTRAINT enforce_dims_the_geom_webmercator CHECK ((st_ndims(the_geom_webmercator) = 2)),
    CONSTRAINT enforce_geotype_the_geom CHECK (((geometrytype(the_geom) = 'POINT'::text) OR (the_geom IS NULL))),
    CONSTRAINT enforce_geotype_the_geom_webmercator CHECK (((geometrytype(the_geom_webmercator) = 'POINT'::text) OR (the_geom_webmercator IS NULL))),
    CONSTRAINT enforce_srid_the_geom CHECK ((st_srid(the_geom) = 4326)),
    CONSTRAINT enforce_srid_the_geom_webmercator CHECK ((st_srid(the_geom_webmercator) = 3857))
);

GRANT ALL ON TABLE _vovw_2_test_table_overviews TO :TESTUSER;
GRANT SELECT ON TABLE _vovw_2_test_table_overviews TO :PUBLICUSER;

INSERT INTO _vovw_2_test_table_overviews VALUES
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.314252', 1, 'Hawai', 'Calle de Pérez Galdós 9, Madrid, Spain', '0101000020E610000000000000000020C00000000000004440', '0101000020110F000076491621312319C122D4663F1DCC5241'),
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.319101', 2, 'El Estocolmo', 'Calle de la Palma 72, Madrid, Spain', '0101000020E610000000000000009431C026043C75E7224340', '0101000020110F0000C4356B29423319C15DD1092DADCC5241');

INSERT INTO _vovw_1_test_table_overviews VALUES
('2011-09-21 14:02:21.358706', '2011-09-21 14:02:21.314252', 1, 'Hawai', 'Calle de Pérez Galdós 9, Madrid, Spain', '0101000020E610000000000000000020C00000000000004440', '0101000020110F000076491621312319C122D4663F1DCC5241');
