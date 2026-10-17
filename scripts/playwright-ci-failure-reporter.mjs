// Print failed assertions immediately so long compatibility jobs can be repaired
// while other tests continue. Playwright's list reporter still owns the summary.
export default class SutraCiFailureReporter {
  onTestEnd(test, result) {
    if (result.status !== 'failed' && result.status !== 'timedOut') return;
    if (result.status === test.expectedStatus) return;
    const title = test.titlePath().filter(Boolean).join(' > ');
    const errors = (result.errors || []).map(error =>
      String(error.stack || error.message || error.value || 'No assertion detail available.')
    ).join('\n\n');
    const limit = 16000;
    const detail = errors.length > limit ? errors.slice(0, limit) + '\n[Remaining detail is in the failure artifact.]' : errors;
    process.stdout.write(`\n[CI assertion failure, attempt ${result.retry + 1}] ${title}\n${detail}\n`);
  }
}
