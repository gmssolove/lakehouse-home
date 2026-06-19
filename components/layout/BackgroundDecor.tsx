export function BackgroundDecor() {
  return (
    <>
      <div className="bg-layer" />
      <div className="bg-deco-geo" aria-hidden="true">
        <svg width="100%" height="100%" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
          <defs>
            <style>{`
              .geo-line{stroke:rgba(196,154,108,0.12);stroke-width:0.5;fill:none;}
              .geo-line-faint{stroke:rgba(196,154,108,0.06);stroke-width:0.5;fill:none;}
              .geo-dot{fill:rgba(196,154,108,0.25);}
            `}</style>
          </defs>
          <g transform="translate(580,200)">
            <circle r="180" className="geo-line-faint" />
            <circle r="140" className="geo-line-faint" />
            <circle r="100" className="geo-line-faint" />
            <circle r="60" className="geo-line-faint" />
            <circle r="20" className="geo-line" />
            <circle r="3" className="geo-dot" />
            <line x1="-180" y1="0" x2="180" y2="0" className="geo-line-faint" />
            <line x1="0" y1="-180" x2="0" y2="180" className="geo-line-faint" />
            <line x1="-127" y1="-127" x2="127" y2="127" className="geo-line-faint" />
            <line x1="127" y1="-127" x2="-127" y2="127" className="geo-line-faint" />
            <line x1="-8" y1="0" x2="8" y2="0" className="geo-line" />
            <line x1="0" y1="-8" x2="0" y2="8" className="geo-line" />
          </g>
          <g opacity="0.4">
            <line x1="700" y1="20" x2="780" y2="20" className="geo-line" />
            <line x1="780" y1="20" x2="780" y2="100" className="geo-line" />
            <line x1="20" y1="480" x2="20" y2="560" className="geo-line" />
            <line x1="20" y1="560" x2="100" y2="560" className="geo-line" />
          </g>
        </svg>
      </div>
      <div className="bg-deco bg-deco-1">d</div>
      <div className="bg-deco bg-deco-2">世</div>
      <div className="bg-home-wordmark" aria-hidden="true">
        lake<span>house</span>
      </div>
    </>
  );
}
