import { describe, expect, it } from 'vitest';
import {
  evaluateReleaseGates,
  VALID_QA_SCENARIOS,
  type QAScenarioId,
  type QAScenarioResult,
  type ReleaseGateAudit,
} from '../../src/server/monitoring/release-gates';

describe('Task 2.7: Soft-Launch Release Gate Audit (Eight Mandatory Gates)', () => {
  const makePassingQAScenarios = (): QAScenarioResult[] =>
    VALID_QA_SCENARIOS.map(id => ({
      id,
      status: 'passed' as const,
      executedAt: new Date().toISOString(),
      summary: `Verified scenario ${id}`,
      evidence: { passed: true },
    }));

  it('evaluates all eight soft-launch release gates and blocks release if ANY gate is unverified', () => {
    const qaScenarios = makePassingQAScenarios();

    // Test each gate failing individually:
    const gateEvidenceKeys: Array<{
      key: keyof Parameters<typeof evaluateReleaseGates>[0];
      name: string;
      expectedBlockingTerm: string;
    }> = [
      {
        key: 'paymentVerificationEvidence',
        name: 'Gate 1 (Payment Verification)',
        expectedBlockingTerm: 'Gate 1: Payment verification',
      },
      {
        key: 'duplicateTokenEvidence',
        name: 'Gate 2 (Duplicate Tokens)',
        expectedBlockingTerm: 'Gate 2: Webhooks must be duplicate-safe',
      },
      {
        key: 'aiQualityEvidence',
        name: 'Gate 3 (AI & VTO Quality)',
        expectedBlockingTerm: 'Gate 3: AI completion',
      },
      {
        key: 'privatePhotoEvidence',
        name: 'Gate 4 (Private Photo Storage)',
        expectedBlockingTerm: 'Gate 4: Photo storage must be strictly private',
      },
      {
        key: 'reportExpiryEvidence',
        name: 'Gate 5 (72h Report Expiry)',
        expectedBlockingTerm: 'Gate 5: Private reports must return HTTP 410',
      },
      {
        key: 'refundRecoveryPolicyEvidence',
        name: 'Gate 6 (Refund & Token Recovery Policy)',
        expectedBlockingTerm: 'Gate 6: Token recovery policy',
      },
      {
        key: 'providerRatesEvidence',
        name: 'Gate 7 (Provider & Merchant Rates)',
        expectedBlockingTerm: 'Gate 7: Provider rates and 100% token cost coverage',
      },
      {
        key: 'monitoringAndKillSwitchEvidence',
        name: 'Gate 8 (Monitoring & Kill Switch)',
        expectedBlockingTerm: 'Gate 8: Error monitoring and operator emergency stop',
      },
    ];

    for (const { key, name, expectedBlockingTerm } of gateEvidenceKeys) {
      const inputs = {
        qaScenarios,
        paymentVerificationEvidence: true,
        duplicateTokenEvidence: true,
        aiQualityEvidence: true,
        privatePhotoEvidence: true,
        reportExpiryEvidence: true,
        refundRecoveryPolicyEvidence: true,
        providerRatesEvidence: true,
        monitoringAndKillSwitchEvidence: true,
        [key]: false, // Individual failure
      };

      const audit = evaluateReleaseGates(inputs);
      expect(
        audit.isLaunchPermitted,
        `${name} failure must block launch`,
      ).toBe(false);

      const hasBlockingReason = audit.blockingReasons.some(r =>
        r.includes(expectedBlockingTerm),
      );
      expect(
        hasBlockingReason,
        `Expected blocking reason for ${name}`,
      ).toBe(true);
    }
  });

  it('blocks launch if QA scenarios matrix is incomplete or has failures', () => {
    // Only 13 of 14 passed
    const incompleteQA = makePassingQAScenarios().slice(0, 13);

    const audit = evaluateReleaseGates({
      qaScenarios: incompleteQA,
      paymentVerificationEvidence: true,
      duplicateTokenEvidence: true,
      aiQualityEvidence: true,
      privatePhotoEvidence: true,
      reportExpiryEvidence: true,
      refundRecoveryPolicyEvidence: true,
      providerRatesEvidence: true,
      monitoringAndKillSwitchEvidence: true,
    });

    expect(audit.isLaunchPermitted).toBe(false);
    expect(audit.blockingReasons.some(r => r.includes('QA Matrix incomplete'))).toBe(true);
  });

  it('generates fully passing Release Gate Audit Report when all 8 gates and 14 QA scenarios pass', () => {
    const qaScenarios = makePassingQAScenarios();

    const audit: ReleaseGateAudit = evaluateReleaseGates({
      qaScenarios,
      paymentVerificationEvidence: true,
      duplicateTokenEvidence: true,
      aiQualityEvidence: true,
      privatePhotoEvidence: true,
      reportExpiryEvidence: true,
      refundRecoveryPolicyEvidence: true,
      providerRatesEvidence: true,
      monitoringAndKillSwitchEvidence: true,
    });

    expect(audit.isLaunchPermitted).toBe(true);
    expect(audit.blockingReasons).toHaveLength(0);
    expect(audit.gates).toHaveLength(8);
    expect(audit.gates.every(g => g.status === 'passed')).toBe(true);
    expect(audit.qaSummary.total).toBe(14);
    expect(audit.qaSummary.passed).toBe(14);
    expect(audit.qaSummary.failed).toBe(0);
  });
});
