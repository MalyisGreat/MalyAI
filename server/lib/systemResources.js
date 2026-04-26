import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { listRunningOllamaModels } from './models.js';

const execFileAsync = promisify(execFile);

function round(value) {
  return Math.round(value * 10) / 10;
}

async function getGpuSummary() {
  try {
    const { stdout } = await execFileAsync(
      'nvidia-smi',
      [
        '--query-gpu=name,utilization.gpu,memory.used,memory.total',
        '--format=csv,noheader,nounits',
      ],
      { timeout: 2500 },
    );
    const firstLine = stdout.split(/\r?\n/).find(Boolean);
    if (!firstLine) {
      return null;
    }

    const [name, utilization, memoryUsed, memoryTotal] = firstLine.split(',').map((item) => item.trim());
    const used = Number(memoryUsed);
    const total = Number(memoryTotal);

    return {
      name,
      utilizationPercent: Number(utilization) || 0,
      memoryUsedMb: Number.isFinite(used) ? used : 0,
      memoryTotalMb: Number.isFinite(total) ? total : 0,
      memoryPercent: total > 0 ? round((used / total) * 100) : 0,
    };
  } catch {
    return null;
  }
}

export async function getSystemResources() {
  const runningModels = await listRunningOllamaModels();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  return {
    ok: true,
    cpu: {
      cores: os.cpus().length,
      loadAverage: os.loadavg(),
    },
    memory: {
      totalBytes: totalMemory,
      freeBytes: freeMemory,
      usedBytes: usedMemory,
      usedPercent: round((usedMemory / totalMemory) * 100),
    },
    gpu: await getGpuSummary(),
    models: runningModels.models,
    sampledAt: new Date().toISOString(),
  };
}
