import { Link } from 'react-router-dom';
import { GraduationCap, PencilRuler } from 'lucide-react';

/** 右上角的端切换：创作端负责开发与发布，学生端只看已发布版本。 */
export function EndSwitch({ current }: { current: 'author' | 'student' }) {
  return (
    <div className='end-switch' role='tablist' aria-label='端切换'>
      <Link
        role='tab'
        aria-selected={current === 'author'}
        className={`end-tab ${current === 'author' ? 'is-active' : ''}`}
        to='/courses'
        title='回到课程开发'
      >
        <PencilRuler size={15} />
        <span>创作端</span>
      </Link>
      <Link
        role='tab'
        aria-selected={current === 'student'}
        className={`end-tab ${current === 'student' ? 'is-active' : ''}`}
        to='/learn'
        title='打开学生端'
      >
        <GraduationCap size={15} />
        <span>学生端</span>
      </Link>
    </div>
  );
}
