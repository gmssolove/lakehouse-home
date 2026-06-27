type ViewProps = {
  likes?: string;
  dislikes?: string;
};

export function LikeHateView({ likes, dislikes }: ViewProps) {
  if (!likes?.trim() && !dislikes?.trim()) return null;
  return (
    <div className="psection trpg-inv-like-hate">
      <div className="trpg-inv-like-hate__col">
        <div className="plabel">LIKE</div>
        <p className="bg-text">{likes?.trim() || '—'}</p>
      </div>
      <div className="trpg-inv-like-hate__sep" aria-hidden="true" />
      <div className="trpg-inv-like-hate__col">
        <div className="plabel">HATE</div>
        <p className="bg-text">{dislikes?.trim() || '—'}</p>
      </div>
    </div>
  );
}

type EditProps = {
  likes: string;
  dislikes: string;
  onChangeLikes: (value: string) => void;
  onChangeDislikes: (value: string) => void;
  variant?: 'section' | 'inline';
};

export function LikeHateEdit({
  likes,
  dislikes,
  onChangeLikes,
  onChangeDislikes,
  variant = 'section',
}: EditProps) {
  const Tag = variant === 'section' ? 'section' : 'div';
  return (
    <Tag className={`trpg-inv-like-hate trpg-inv-like-hate--edit${variant === 'section' ? ' trpg-inv-section' : ' trpg-inv-like-hate--inline'}`}>
      <div className="trpg-inv-like-hate__col">
        <h4 className="trpg-inv-section__label">LIKE</h4>
        <textarea
          className={variant === 'section' ? 'trpg-inv-edit-field' : 'form-input'}
          rows={2}
          placeholder="LIKE"
          value={likes}
          onChange={(e) => onChangeLikes(e.target.value)}
        />
      </div>
      <div className="trpg-inv-like-hate__sep" aria-hidden="true" />
      <div className="trpg-inv-like-hate__col">
        <h4 className="trpg-inv-section__label">HATE</h4>
        <textarea
          className={variant === 'section' ? 'trpg-inv-edit-field' : 'form-input'}
          rows={2}
          placeholder="HATE"
          value={dislikes}
          onChange={(e) => onChangeDislikes(e.target.value)}
        />
      </div>
    </Tag>
  );
}
