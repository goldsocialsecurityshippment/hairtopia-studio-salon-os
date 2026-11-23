import { listPendingMobileMoneyProofs } from "@/lib/actions/payment-proofs";
import { PaymentProofReviewQueue } from "./PaymentProofReviewQueue";

export default async function PaymentReviewPage() {
  const proofs = await listPendingMobileMoneyProofs();
  return (
    <div>
      <h1 className="font-display text-2xl text-ink">Mobile Money proof review</h1>
      <p className="mt-1 text-sm text-ink-soft">Review private transfer screenshots. Only an approval updates the accepted payment balance; rejected submissions leave the appointment pending.</p>
      <div className="mt-6">
        <PaymentProofReviewQueue proofs={proofs} />
      </div>
    </div>
  );
}
