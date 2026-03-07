'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/Header';

interface GuestMember {
  id: string;
  name: string;
  isPrimary: boolean;
  rsvpStatus: string;
}

interface GuestGroup {
  groupId: string;
  groupName: string;
  members: GuestMember[];
}

type AttendanceMap = Record<string, 'attending' | 'not_attending'>;

const RsvpPage = () => {
  const router = useRouter();
  const [searchName, setSearchName] = useState('');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [groups, setGroups] = useState<GuestGroup[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [confirmedGroup, setConfirmedGroup] = useState<GuestGroup | null>(null);
  const [attendance, setAttendance] = useState<AttendanceMap>({});
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const handleSearch = async () => {
    if (!searchName.trim()) return;

    setIsSearching(true);
    setNotFound(false);
    setGroups([]);
    setConfirmedGroup(null);
    setAttendance({});

    try {
      const res = await fetch(`/api/rsvp?name=${encodeURIComponent(searchName.trim())}`);
      if (res.status === 404) {
        setNotFound(true);
      } else if (res.ok) {
        const data: GuestGroup[] = await res.json();
        setGroups(data);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setIsSearching(false);
      setSearchPerformed(true);
    }
  };

  const handleConfirm = (group: GuestGroup) => {
    const initialAttendance: AttendanceMap = {};
    for (const member of group.members) {
      initialAttendance[member.id] =
        member.rsvpStatus === 'attending' ? 'attending' : 'not_attending';
    }
    setAttendance(initialAttendance);
    setConfirmedGroup(group);
  };

  const handleSearchAgain = () => {
    setConfirmedGroup(null);
    setGroups([]);
    setSearchPerformed(false);
    setNotFound(false);
    setSearchName('');
  };

  const handleSubmit = async () => {
    if (!confirmedGroup) return;

    setIsSubmitting(true);
    setSubmitError(false);

    const attendingMembers = Object.entries(attendance)
      .filter(([, status]) => status === 'attending')
      .map(([id]) => ({ id, rsvpStatus: 'attending' }));

    try {
      const res = await fetch('/api/rsvp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: confirmedGroup.groupId,
          members: attendingMembers,
        }),
      });

      if (res.status === 204) {
        router.push('/rsvp/thank-you');
      } else {
        setSubmitError(true);
      }
    } catch {
      setSubmitError(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className='min-h-screen flex flex-col bg-sage-50/30'>
      <Header />

      <div className='flex-1 flex flex-col items-center px-6 py-16'>
        <h1 className='text-4xl sm:text-5xl text-sage-800 text-center'>RSVP</h1>
        <p className='text-lg text-sage-700 mt-4 text-center'>
          Enter your full name to find your invitation.
        </p>

        {/* Search Bar */}
        <div className='mt-8 flex flex-col sm:flex-row gap-3 w-full max-w-lg'>
          <input
            type='text'
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isSearching && searchName.trim()) {
                handleSearch();
              }
            }}
            placeholder='Enter your full name to get started'
            className='flex-1 px-4 py-3 border border-sage-200 rounded-lg text-sage-800 placeholder-sage-700/50 bg-white focus:outline-none focus:ring-2 focus:ring-sage-700/40'
          />
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchName.trim()}
            className='px-6 py-3 bg-sage-700 text-white rounded-lg hover:bg-sage-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* Results */}
        {searchPerformed && (
          <div className='mt-8 w-full max-w-lg'>
            {notFound && (
              <p className='text-center text-sage-700'>
                We couldn&apos;t find your name. Please contact us if you believe this is an error.
              </p>
            )}

            {!notFound && !confirmedGroup && groups.length > 0 && (
              <div className='space-y-4'>
                {groups.map((group) => (
                  <div
                    key={group.groupId}
                    className='bg-white border border-sage-200 rounded-xl p-6 shadow-sm'
                  >
                    <p className='text-lg text-sage-800 font-semibold mb-1'>Is this you?</p>
                    <p className='text-sage-700 mb-3'>{group.groupName}</p>
                    <ul className='mb-4 space-y-1'>
                      {group.members.map((m) => (
                        <li key={m.id} className='text-sage-700 text-sm'>
                          {m.name}
                          {m.isPrimary && (
                            <span className='ml-2 text-xs text-sage-700/60'>(primary)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className='flex gap-3'>
                      <button
                        onClick={() => handleConfirm(group)}
                        className='px-5 py-2 bg-sage-700 text-white rounded-lg hover:bg-sage-800 transition-colors duration-200 text-sm'
                      >
                        Yes, that&apos;s me
                      </button>
                      <button
                        onClick={handleSearchAgain}
                        className='px-5 py-2 border border-sage-200 text-sage-700 rounded-lg hover:bg-sage-100 transition-colors duration-200 text-sm'
                      >
                        No, search again
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Attendance Form */}
            {confirmedGroup && (
              <div className='bg-white border border-sage-200 rounded-xl p-6 shadow-sm'>
                <p className='text-lg text-sage-800 font-semibold mb-4'>
                  Who will be attending?
                </p>
                <ul className='space-y-4 mb-6'>
                  {confirmedGroup.members.map((member) => (
                    <li key={member.id} className='flex items-center justify-between'>
                      <span className='text-sage-800'>{member.name}</span>
                      <div className='flex gap-3'>
                        <label className='flex items-center gap-1.5 cursor-pointer'>
                          <input
                            type='radio'
                            name={`attendance-${member.id}`}
                            value='attending'
                            checked={attendance[member.id] === 'attending'}
                            onChange={() =>
                              setAttendance((prev) => ({ ...prev, [member.id]: 'attending' }))
                            }
                            className='accent-sage-700'
                          />
                          <span className='text-sm text-sage-700'>✅ Attending</span>
                        </label>
                        <label className='flex items-center gap-1.5 cursor-pointer'>
                          <input
                            type='radio'
                            name={`attendance-${member.id}`}
                            value='not_attending'
                            checked={attendance[member.id] === 'not_attending'}
                            onChange={() =>
                              setAttendance((prev) => ({
                                ...prev,
                                [member.id]: 'not_attending',
                              }))
                            }
                            className='accent-sage-700'
                          />
                          <span className='text-sm text-sage-700'>❌ Not Attending</span>
                        </label>
                      </div>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className='w-full py-3 bg-sage-700 text-white rounded-lg hover:bg-sage-800 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
                >
                  {isSubmitting ? 'Submitting...' : 'Submit RSVP'}
                </button>
                {submitError && (
                  <p className='mt-3 text-center text-sm text-red-600'>
                    Something went wrong. Please try again.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RsvpPage;
