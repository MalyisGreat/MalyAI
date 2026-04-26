import {
  createAutomation,
  deleteAutomation,
  getAutomationStatus,
  listAutomations,
  noteInteractivePromptEnd,
  noteInteractivePromptStart,
  runAutomationNow,
  updateAutomation,
} from '../server/lib/automationQueue.js';

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const created = await createAutomation({
  prompt: 'Create a weekly Maly AI improvement plan with evidence and next actions.',
  cadence: 'weekly',
  delayMinutes: 60,
  idleWindowMs: 2000,
  useSearch: true,
  useSubagents: false,
});

assert(created.status === 'queued', 'created automation should be queued');
assert(created.plan.length > 0, 'created automation should include planned steps');

const listed = await listAutomations();
assert(listed.tasks.some((task) => task.id === created.id), 'created automation should be listed');

noteInteractivePromptStart();
const busy = getAutomationStatus();
assert(busy.activePromptCount > 0, 'active prompt count should increment');
noteInteractivePromptEnd();
const idle = getAutomationStatus();
assert(idle.activePromptCount === 0, 'active prompt count should decrement');

const paused = await updateAutomation(created.id, { status: 'paused' });
assert(paused.status === 'paused', 'automation should pause');

const queued = await runAutomationNow(created.id);
assert(queued.status === 'queued', 'run now should queue automation');

const deleted = await deleteAutomation(created.id);
assert(deleted.ok, 'automation should delete');

console.log(
  JSON.stringify(
    {
      ok: true,
      created: created.id,
      queueCountBeforeDelete: listed.tasks.length,
      idleWindowMs: created.idleWindowMs,
    },
    null,
    2,
  ),
);
