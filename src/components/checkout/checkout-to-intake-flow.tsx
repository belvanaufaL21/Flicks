'use client';

import React, { useRef, useState } from 'react';
import {
  PhotoIntakeForm,
  type PurchasedTokenCredential,
} from '../photo-intake/photo-intake-form';
import { SnapCheckout, type SnapSuccessPayload } from './snap-checkout';
import styles from './snap-checkout.module.css';

export interface CheckoutToIntakeFlowProps {
  clientKey?: string;
  isProduction?: boolean;
}

export function CheckoutToIntakeFlow({
  clientKey,
  isProduction,
}: CheckoutToIntakeFlowProps) {
  const [purchasedToken, setPurchasedToken] =
    useState<PurchasedTokenCredential | null>(null);
  const intakeRef = useRef<HTMLDivElement | null>(null);

  function handleCheckoutSuccess(payload: SnapSuccessPayload) {
    setPurchasedToken({
      tokenId: payload.tokenId,
      tokenSecret: payload.tokenSecret,
    });
    intakeRef.current?.scrollIntoView?.({
      behavior: 'smooth',
      block: 'start',
    });
  }

  return (
    <div className={styles.flowContainer}>
      <div id="checkout-section" className={styles.checkoutAnchor}>
        <SnapCheckout
          clientKey={clientKey}
          isProduction={isProduction}
          onSuccess={handleCheckoutSuccess}
        />
      </div>
      <div id="intake-section" ref={intakeRef} className={styles.intakeAnchor}>
        <PhotoIntakeForm
          purchasedToken={purchasedToken}
          requirePurchasedToken
        />
      </div>
    </div>
  );
}
