// The radio mark used by the model and resolution panels.
//
// The reference bar's two list popovers both use radios rather than a tick in
// the trailing corner, and the difference is not decorative: a radio says
// "exactly one of these is on" before you have read a single label, which is
// precisely what those two lists mean. A trailing tick only tells you which
// row is current once you have found it.
//
// Hand-drawn rather than an <input type="radio">: the rows are buttons inside
// a popover, not a form, and a native radio would drag the platform's own
// colours and focus ring into a charter that has its own.
export function Radio({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-[15px] w-[15px] flex-shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ease-out ${
        checked ? 'border-[#716FFF]' : 'border-[#DEDEE8]'
      }`}
    >
      {/* Scaled rather than mounted: a dot that pops from nothing reads as a
          glitch, one that grows from 0.4 reads as a control answering. */}
      <span
        className={`h-[7px] w-[7px] rounded-full bg-[#716FFF] transition-transform duration-150 ease-out ${
          checked ? 'scale-100' : 'scale-0'
        }`}
      />
    </span>
  );
}
