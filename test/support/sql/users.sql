-- public user role
DROP USER IF EXISTS :PUBLICUSER;
CREATE USER :PUBLICUSER WITH PASSWORD ':PUBLICPASS';
ALTER ROLE :PUBLICUSER SET search_path = :SEARCHPATH, cartodb;

-- db owner role
DROP USER IF EXISTS :TESTUSER;
CREATE USER :TESTUSER WITH PASSWORD ':TESTPASS';
ALTER ROLE :TESTUSER SET search_path = :SEARCHPATH, cartodb;

-- regular user role 1
DROP USER IF EXISTS test_windshaft_regular1;
CREATE USER test_windshaft_regular1 WITH PASSWORD 'regular1';
ALTER ROLE :TESTUSER SET search_path = :SEARCHPATH, cartodb;
GRANT test_windshaft_regular1 to :TESTUSER;
