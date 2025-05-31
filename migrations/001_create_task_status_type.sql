-- Create an ENUM type for task status
CREATE TYPE task_status AS ENUM (
  'Upcoming Task',
  'Ongoing Task',
  'Failed Task',
  'Successful Task'
);
