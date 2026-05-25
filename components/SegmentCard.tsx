import React from 'react';

type SegmentCardProps = {
  title: string;
  desc: string;
  img: string;
};

const SegmentCard: React.FC<SegmentCardProps> = React.memo(({ title, desc, img }) => (
  <div className="snap-center shrink-0 flex flex-col bg-white rounded-3xl overflow-hidden w-[80vw] sm:w-[320px] md:w-[420px] shadow-lg border border-slate-100 hover:shadow-2xl hover:-translate-y-2 transition-all duration-500 group">
    <div className="w-full h-48 md:h-64 bg-slate-100 relative overflow-hidden flex items-center justify-center">
      <img 
        src={img} 
        alt={title} 
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
        loading="lazy" 
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </div>
    <div className="p-6 md:p-8 flex flex-col flex-1 text-center justify-center">
      <h3 className="text-xl md:text-2xl font-black text-slate-800 mb-3">{title}</h3>
      <p className="text-slate-500 text-sm md:text-base leading-relaxed whitespace-normal break-words">
        {desc}
      </p>
    </div>
  </div>
));

export default SegmentCard;
