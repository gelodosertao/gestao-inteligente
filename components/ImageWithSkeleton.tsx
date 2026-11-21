import React, { useState } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface ImageWithSkeletonProps extends HTMLMotionProps<"img"> {
  containerClassName?: string;
}

const ImageWithSkeleton: React.FC<ImageWithSkeletonProps> = ({ 
  containerClassName = '',
  className = '',
  alt,
  ...props 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {/* Skeleton / Shimmer background */}
      {!isLoaded && (
        <motion.div
          className="absolute inset-0 bg-slate-200"
          animate={{ opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      
      {/* Actual Image */}
      <motion.img
        {...props}
        alt={alt || ''}
        className={`${className} ${isLoaded ? 'opacity-100' : 'opacity-0'} transition-opacity duration-500`}
        initial={{ opacity: 0 }}
        animate={{ opacity: isLoaded ? 1 : 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        onLoad={(e) => {
          setIsLoaded(true);
          if (props.onLoad) props.onLoad(e);
        }}
      />
    </div>
  );
};

export default ImageWithSkeleton;
