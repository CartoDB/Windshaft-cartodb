/**
 * PhasedExecution handles the execution of async tasks (via Promises)
 * which have dependencies between them in a simplified manner.
 * Instead of using the complete task dependency graph, tasks
 * are organized into execution phases. So that tasks from a latter
 * phase will be initialized after tasks from previous phases have
 * finished.
 *
 * All tasks place their results in a shared object to make them
 * available to tasks of latter phases.
 *
 * Each phase is defined by a function that defines its tasks.
 *
 * Example:
 *
 *     let p = new PhasedExecution();
 *     // Define first phase with tasks 1 & 2
 *     p.phase(() => {
 *         p.results.phase1 = 1
 *         p.task(new Promise((resolve) => {
 *             setTimeout( () => {
 *                 console.log('At 1:', p.results);
 *                 p.results.task1 = 100;
 *                 resolve();
 *             }, 400);
 *         }));
 *         p.task(new Promise((resolve) => {
 *             setTimeout( () => {
 *                 console.log('At 2:', p.results);
 *                 p.results.task2 = 200;
 *                 resolve();
 *             }, 100);
 *         }));
 *     });
 *     // Define second phase with tasks 3 & 4
 *     p.phase(() => {
 *         p.results.phase2 = 2
 *         p.task(new Promise((resolve) => {
 *             setTimeout( () => {
 *                 console.log('At 3:', p.results);
 *                 p.results.task3 = 300;
 *                 resolve();
 *             }, 50);
 *         }));
 *         p.task(new Promise((resolve) => {
 *             setTimeout( () => {
 *                 console.log('At 4:', p.results);
 *                 p.results.task4 = 400;
 *                 resolve();
 *             }, 100);
 *         }));
 *     });
 *     // Define third phase with task 5
 *     p.phase(() => {
 *         p.results.phase3 = 3
 *         p.task(new Promise((resolve) => {
 *             setTimeout( () => {
 *                 console.log('At 5:', p.results);
 *                 p.results.task5 = 500;
 *                 resolve();
 *             }, 50);
 *         }));
 *     });
 *     // Execute all tasks
 *     p.run(() => {
 *         console.log("RESULTS:", p.results);
 *     });
 */
module.exports = class PhasedExecution {
    constructor() {
        this.results = {};
        this.phases = [];
    }
    phase(phasegenerator) {
        this.phases.push(phasegenerator);
    }
    task(promise) {
        this.tasks.push(promise);
    }
    run(callback) {
        this.tasks = [];
        let phase = this.phases.shift();
        if (phase) {
            phase(this);
            return Promise.all(this.tasks)
                .then(this.run())
                .then(() => { if (callback) { callback(this.results); } });
        }
    }
};
// TODO: error handling
