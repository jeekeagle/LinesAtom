import { LectureReader } from '../components/LectureReader';
import { useApp } from '../context/AppContext';

export function LecturePage() {
  const { data } = useApp();
  if (!data) return null;
  return (
    <div className="page-reader">
      <LectureReader project={data.project} />
    </div>
  );
}