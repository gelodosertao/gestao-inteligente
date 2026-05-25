import React from 'react';

type SegmentCardProps = {
  title: string;
  desc: string;
  img: string;
};

const SegmentCard: React.FC<SegmentCardProps> = React.memo(({ title, desc, img }) => (
  <div className="snap-center shrink-0 flex flex-col bg-white rounded-3xl overflow-hidden min-w-[85vw] md:min-w-[420px] shadow-xl border border-slate-200 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group">
    <div className="w-full h-48 md:h-72 bg-gradient-to-br from-slate-100 to-slate-200 relative overflow-hidden p-4">
      <img src={img} alt={title} className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-white/20 to-transparent" />
    </div>
    <div className="p-6 md:p-8 text-center">
      <h3 className="text-xl md:text-3xl font-black text-slate-800 mb-2 md:mb-3">{title}</h3>
      <p className="text-slate-600 text-sm md:text-base leading-relaxed">{desc}</p>
    </div>
  </div>
));

export default SegmentCard;
