import { useState } from 'react';

const initialState = {
  fullName: '',
  email: '',
  attending: 'Yes',
  numGuests: 1,
  mealPreference: '',
  message: ''
};

export default function RSVPForm({ confirmationMessage }) {
  const [formData, setFormData] = useState(initialState);
  const [status, setStatus] = useState({ type: null, message: null });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (event) => {
    const { name, value } = event.target;
    const numericValue = value === '' ? '' : Number(value);
    setFormData((prev) => ({ ...prev, [name]: numericValue }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus({ type: null, message: null });

    try {
      const payload = {
        fullName: formData.fullName.trim(),
        email: formData.email.trim(),
        attending: formData.attending,
        numGuests: Number(formData.numGuests),
        mealPreference: formData.mealPreference.trim() || null,
        message: formData.message.trim() || null
      };

      const response = await fetch('/api/rsvp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Something went wrong');
      }

      setStatus({ type: 'success', message: confirmationMessage });
      setFormData(initialState);
    } catch (error) {
      setStatus({ type: 'error', message: error.message || 'There was an error submitting your RSVP.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="rsvp" className="bg-background px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-3xl rounded-3xl border border-primary/30 bg-accent/30 p-8 shadow-lg">
        <h2 className="font-display text-3xl tracking-tight text-text sm:text-[1.75rem]">RSVP</h2>
        <p className="mt-4 text-base text-text/80">
          Coming soon!
        </p>
        {/* <p className="mt-4 text-base text-text/80">
          We can&apos;t wait to celebrate with you. Please let us know if you&apos;ll be joining and share any special requests.
        </p> */}
        {/* <form className="mt-8 grid gap-6" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <label htmlFor="fullName" className="text-sm font-medium text-text">
              Full Name<span className="text-primary">*</span>
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              required
              value={formData.fullName}
              onChange={handleChange}
              className="w-full rounded-full border border-primary/30 bg-white px-4 py-3 text-sm text-text placeholder:text-text/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="email" className="text-sm font-medium text-text">
              Email<span className="text-primary">*</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              value={formData.email}
              onChange={handleChange}
              className="w-full rounded-full border border-primary/30 bg-white px-4 py-3 text-sm text-text placeholder:text-text/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <fieldset className="grid gap-4">
            <legend className="text-sm font-medium text-text">Will you be attending?<span className="text-primary">*</span></legend>
            <div className="flex flex-wrap gap-4">
              {['Yes', 'No'].map((option) => (
                <label key={option} className="inline-flex items-center gap-2 text-sm text-text">
                  <input
                    type="radio"
                    name="attending"
                    value={option}
                    checked={formData.attending === option}
                    onChange={handleChange}
                    className="h-4 w-4 border-primary/40 text-primary focus:ring-primary"
                    required
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-2">
            <label htmlFor="numGuests" className="text-sm font-medium text-text">
              Number of Guests<span className="text-primary">*</span>
            </label>
            <input
              id="numGuests"
              name="numGuests"
              type="number"
              min="0"
              max="10"
              required
              value={formData.numGuests}
              onChange={handleNumberChange}
              className="w-full rounded-full border border-primary/30 bg-white px-4 py-3 text-sm text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="mealPreference" className="text-sm font-medium text-text">
              Meal Preference
            </label>
            <input
              id="mealPreference"
              name="mealPreference"
              type="text"
              value={formData.mealPreference}
              onChange={handleChange}
              className="w-full rounded-full border border-primary/30 bg-white px-4 py-3 text-sm text-text placeholder:text-text/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="message" className="text-sm font-medium text-text">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              rows="4"
              value={formData.message}
              onChange={handleChange}
              className="w-full rounded-3xl border border-primary/30 bg-white px-4 py-3 text-sm text-text placeholder:text-text/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center justify-center rounded-full bg-primary px-8 py-3 text-sm font-medium text-text transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-text"
          >
            {isSubmitting ? 'Submitting…' : 'Submit RSVP'}
          </button>

          <p
            role="status"
            aria-live="polite"
            className={`text-sm ${
              status.type === 'success'
                ? 'text-emerald-600'
                : status.type === 'error'
                ? 'text-red-600'
                : 'text-text/0'
            }`}
          >
            {status.message}
          </p>
        </form> */}
      </div>
    </section>
  );
}
