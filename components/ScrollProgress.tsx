import React from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

const ScrollProgress: React.FC = () => {
  const { scrollYProgress } = useScroll();
  
  // Spring physics for smoother feeling (Jakub Krehel style - polished)
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001
  });

  return (
    <motion.div
      className="fixed top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-cyan-400 to-blue-600 origin-left z-[100]"
      style={{ scaleX }}
    />
  );
};

export default ScrollProgress;
