# How to release

1. Test (npm test), fix if broken before proceeding.
2. Ensure proper version in `package.json` and `package-lock.json`.
3. Ensure NEWS section exists for the new version, review it, add release date.
4. If there are modified dependencies in `package.json`, update them with `npm upgrade {{package_name}}@{{version}}`.
5. Commit `package.json`, `package-lock.json`, NEWS.
6. Run `git tag -a Major.Minor.Patch`. Use NEWS section as content.
7. Stub NEWS/package for next version.

## Version:

* Bugfix releases increment Patch component of version.
* Feature releases increment Minor and set Patch to zero.
* If backward compatibility is broken, increment Major and set to zero Minor and Patch.
* Branches named 'b<Major>.<Minor>' are kept for any critical fix that might need to be shipped before next feature release is ready.
