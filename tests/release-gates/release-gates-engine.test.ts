import { describe, expect, it } from 'vitest';
import {
  evaluateQAScenario,
  evaluateReleaseGates,
  measureAiQualityTargets,
  recordVtoQualityBaseline,
  type QAScenarioId,
  type QAScenarioResult,
  type ReleaseGateAudit,
  type VtoBaselineAttempt,
} from '../../src/server/monitoring/release-gates';

describe('Release Gates Engine (Task 2.1–2.7)', () => {
  describe('Task 2.1: QA Scenario Evaluation and Evidence Recording', () => {
    it('records pass/fail evidence for individual QA scenarios with timestamps', () => {
      const result = evaluateQAScenario('QA-01', {
        passed: true,
        summary: 'Valid photo and available token created single analysis job',
        evidence: { jobId: 'job-123', status: 'completed' },
      });

      expect(result.id).toBe('QA-01');
      expect(result.status).toBe('passed');
      expect(result.executedAt).toBeDefined();
      expect(result.summary).toContain('Valid photo');
      expect(result.evidence).toEqual({ jobId: 'job-123', status: 'completed' });
    });

    it('rejects unrecognized QA IDs with type safety', () => {
      // @ts-expect-error Invalid QA ID should fail type checking
      const result = evaluateQAScenario('QA-99', {
        passed: false,
        summary: 'Invalid scenario',
      });
      expect(result.status).toBe('failed');
    });
  });

  describe('Task 2.5: AI Completion and Schema Validation Rate Measurement', () => {
    it('calculates completion and schema validity rates and verifies PRD targets (>=90% completion, >=95% schema)', () => {
      // 50 total trials: 48 completed, 2 unrecoverable; 49 schema-valid
      const trials = [
        ...Array.from({ length: 48 }, (_, i) => ({
          trialId: `trial-${i}`,
          completed: true,
          schemaValid: true,
          attempts: 1,
        })),
        { trialId: 'trial-48', completed: false, schemaValid: true, attempts: 2 },
        { trialId: 'trial-49', completed: false, schemaValid: false, attempts: 2 },
      ];

      const metrics = measureAiQualityTargets(trials);

      expect(metrics.totalTrials).toBe(50);
      expect(metrics.completedCount).toBe(48);
      expect(metrics.completionRatePercent).toBe(96);
      expect(metrics.meetsCompletionTarget).toBe(true); // >= 90%

      expect(metrics.schemaValidCount).toBe(49);
      expect(metrics.schemaValidityPercent).toBe(98);
      expect(metrics.meetsSchemaTarget).toBe(true); // >= 95%

      expect(metrics.overallPass).toBe(true);
    });

    it('fails when completion rate is below 90%', () => {
      const trials = [
        ...Array.from({ length: 40 }, (_, i) => ({
          trialId: `trial-${i}`,
          completed: true,
          schemaValid: true,
          attempts: 1,
        })),
        ...Array.from({ length: 10 }, (_, i) => ({
          trialId: `fail-${i}`,
          completed: false,
          schemaValid: true,
          attempts: 2,
        })),
      ];

      const metrics = measureAiQualityTargets(trials);
      expect(metrics.completionRatePercent).toBe(80);
      expect(metrics.meetsCompletionTarget).toBe(false);
      expect(metrics.overallPass).toBe(false);
    });
  });

  describe('Task 2.6: VTO Baseline (20-30 attempts) and 100% Cost Recording', () => {
    it('establishes baseline from 25 attempts, calculates unit economics and asserts 100% token cost coverage', () => {
      const attempts: VtoBaselineAttempt[] = Array.from({ length: 25 }, (_, i) => ({
        attemptId: `vto-base-${i}`,
        tokenId: `token-${i}`,
        productId: `prod-${i % 5}`,
        category: i % 2 === 0 ? 'tops' : 'bottoms',
        status: i === 24 ? 'failed' : 'completed', // 24 success, 1 failed
        geminiCostIdr: 75,
        fashnCostIdr: 1200,
        midtransFeeIdr: 133,
        revenueIdr: 19000,
        hasCostLogged: true,
      }));

      const baseline = recordVtoQualityBaseline(attempts);

      expect(baseline.totalAttempts).toBe(25);
      expect(baseline.isValidBaselineSize).toBe(true); // 20 <= 25 <= 30
      expect(baseline.costCoveragePercent).toBe(100);
      expect(baseline.has100PercentCostCoverage).toBe(true);
      expect(baseline.averageCogsPerPackageIdr).toBe(1408); // 75 + 1200 + 133
      expect(baseline.averageGrossMarginPercent).toBeGreaterThan(90);
    });

    it('rejects baseline sizes outside 20-30 attempts', () => {
      const tooFew: VtoBaselineAttempt[] = Array.from({ length: 15 }, (_, i) => ({
        attemptId: `att-${i}`,
        tokenId: `tok-${i}`,
        productId: 'prod-1',
        category: 'tops',
        status: 'completed',
        geminiCostIdr: 75,
        fashnCostIdr: 1200,
        midtransFeeIdr: 133,
        revenueIdr: 19000,
        hasCostLogged: true,
      }));

      const baseline = recordVtoQualityBaseline(tooFew);
      expect(baseline.isValidBaselineSize).toBe(false);
      expect(baseline.overallPass).toBe(false);
    });
  });

  describe('Task 2.7: Eight Soft-Launch Release Gates Audit', () => {
    it('blocks release if any gate is unverified or failed', () => {
      const partialAudit = evaluateReleaseGates({
        qaScenarios: [
          { id: 'QA-01', status: 'passed', summary: 'ok' },
          { id: 'QA-02', status: 'passed', summary: 'ok' },
        ],
        paymentVerificationEvidence: true,
        duplicateTokenEvidence: true,
        aiQualityEvidence: true,
        privatePhotoEvidence: true,
        reportExpiryEvidence: true,
        refundRecoveryPolicyEvidence: true,
        providerRatesEvidence: true,
        monitoringAndKillSwitchEvidence: false, // GATE 8 FAILED
      });

      expect(partialAudit.isLaunchPermitted).toBe(false);
      expect(partialAudit.gates.find(g => g.gateId === 'gate_8_monitoring_and_kill_switch')?.status).toBe('failed');
      expect(partialAudit.blockingReasons).toContain('Gate 8: Error monitoring and operator emergency stop must be active and tested');
    });

    it('permits launch ONLY when all 8 gates and all 14 QA scenarios have passing evidence', () => {
      const allQAPassed: QAScenarioResult[] = Array.from({ length: 14 }, (_, i) => {
        const id = `QA-${String(i + 1).padStart(2, '0')}` as QAScenarioId;
        return {
          id,
          status: 'passed' as const,
          executedAt: new Date().toISOString(),
          summary: `Scenario ${id} verified`,
        };
      });

      const fullAudit = evaluateReleaseGates({
        qaScenarios: allQAPassed,
        paymentVerificationEvidence: true,
        duplicateTokenEvidence: true,
        aiQualityEvidence: true,
        privatePhotoEvidence: true,
        reportExpiryEvidence: true,
        refundRecoveryPolicyEvidence: true,
        providerRatesEvidence: true,
        monitoringAndKillSwitchEvidence: true,
      });

      expect(fullAudit.isLaunchPermitted).toBe(true);
      expect(fullAudit.blockingReasons).toHaveLength(0);
      expect(fullAudit.gates).toHaveLength(8);
      expect(fullAudit.gates.every(g => g.status === 'passed')).toBe(true);
      expect(fullAudit.qaSummary.total).toBe(14);
      expect(fullAudit.qaSummary.passed).toBe(14);
    });
  });
});
