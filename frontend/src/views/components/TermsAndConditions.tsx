import { Modal } from './Modal';

/** Senior citizen discount on a customer's bill — must match the backend rate. */
export const SENIOR_DISCOUNT_RATE = 0.2;
export const SENIOR_DISCOUNT_PERCENT = Math.round(SENIOR_DISCOUNT_RATE * 100);

/** The FlowGuard customer Terms and Conditions (shown at signup). */
export function TermsContent() {
  return (
    <div className="terms-content">
      <p className="terms-updated">Last updated: November 3, 2026</p>
      <p>
        By creating a FlowGuard account you agree to these terms. Please read them before
        filing a complaint or requesting a service.
      </p>

      <h4>1. Free of charge (covered by Maynilad)</h4>
      <p>You do not pay for concerns that Maynilad is responsible for, such as:</p>
      <ul>
        <li>Leaks or broken pipes on the main or public lines</li>
        <li>Water quality concerns: bad odor or dirty water</li>
        <li>Low water pressure or no water supply</li>
      </ul>

      <h4>2. Payment first (charged to the customer)</h4>
      <p>
        Work on <strong>your own side of the line</strong> is charged to you. Examples are leaks
        or holes in your private pipes, new connections, reconnections, meter replacement, or
        any repair that needs materials for your own line.
      </p>
      <ul>
        <li>The Technical Team prepares a price breakdown of the materials, labor and other fees.</li>
        <li>
          The bill must be <strong>paid in full before the repair is scheduled</strong> and before
          materials are released.
        </li>
        <li>The Commercial Department makes the final decision on whether a concern is free or charged.</li>
      </ul>

      <h4>3. Senior citizen discount</h4>
      <ul>
        <li>
          Registered senior citizens (60 years old and above) get a{' '}
          <strong>{SENIOR_DISCOUNT_PERCENT}% discount</strong> on their bills.
        </li>
        <li>Mark yourself as a senior citizen and enter your Senior Citizen ID number in your account.</li>
        <li>
          Show your valid Senior Citizen ID when you pay. The discount is removed if the ID
          cannot be verified.
        </li>
      </ul>

      <h4>4. Payments</h4>
      <ul>
        <li>Pay through the payment options listed on your bill, or in cash at the office for an Official Receipt.</li>
        <li>Pay on or before the due date. Unpaid bills past the due date are marked as overdue.</li>
      </ul>

      <h4>5. Your responsibilities</h4>
      <ul>
        <li>Give accurate information, a correct location and a clear photo when you file a complaint.</li>
        <li>Allow our staff to visit the site to check the concern.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
      </ul>

      <h4>6. Privacy</h4>
      <p>
        Your personal information is used only to handle your complaints, service requests and
        bills, in line with the Data Privacy Act of 2012 (RA 10173).
      </p>

      <h4>7. Changes to these terms</h4>
      <p>We may update these terms. Changes take effect once posted in FlowGuard.</p>
    </div>
  );
}

/** Terms and Conditions in a modal; `onAgree` adds an "I Agree" button. */
export function TermsModal({ onClose, onAgree }: { onClose: () => void; onAgree?: () => void }) {
  return (
    <Modal
      title="Terms and Conditions"
      open
      wide
      onClose={onClose}
      onSubmit={onAgree}
      submitText="I Agree"
      closeText="Close"
    >
      <TermsContent />
    </Modal>
  );
}
