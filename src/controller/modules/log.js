import { User, Repo, Log, Project, Notification } from '../../model';
import { Logger } from '../../helpers/utils';

function* getLog(id, model, scope, pageMixin) {
  const data = yield model.findOne({ where: { id } });
  const logs = yield data.getLogs({
    attributes: { exclude: ['operator'] },
    include: [
      { model, as: scope },
      { model: User, as: 'logCreator' },
    ],
    ...pageMixin,
  });
  const totalCount = yield Log.count({
    where: {
      loggerId: id,
      scope,
    },
  });
  return { logs, totalCount };
}

export function* getLogList(next) {
  const { repoId, projectId } = this.param;
  const { pageMixin } = this.state;
  let result = {};
  if (!isNaN(repoId)) {
    result = yield getLog(repoId, Repo, 'repo', pageMixin);
  } else if (!isNaN(projectId)) {
    result = yield getLog(projectId, Project, 'project', pageMixin);
  }

  this.state.respond = result.logs;
  this.state.page.totalCount = result.totalCount;
  yield next;
}

/**
 * 记录单条日志信息
 */
function* recordSingleLog(oneLog) {
  const { params, loggerId, subscribers, type } = oneLog;
  // 处理一下参数，传入的以 icon/user 开头的数组，转化成数组对象
  const log = new Logger(type, params);
  const scope = /^PROJECT/.test(type) ? 'project' : 'repo';
  const logModel = yield Log.create({
    type,
    loggerId,
    scope,
    operation: log.text,
  });

  return Notification.bulkCreate(subscribers.map(v => ({
    userId: v,
    logId: logModel.id,
  })));
}

/**
 * 记录日志中间件，需要分析 state.log
 * 同时确定日志（通知）的发送对象
 */
export function* recordLog(next) {
  const { log } = this.state;
  if (Array.isArray(log)) {
    const len = log.length;
    let i = 0;
    for (; i < len; i++) {
      yield recordSingleLog(log[i]);
    }
  } else if (typeof log === 'object') {
    yield recordSingleLog(log);
  }

  yield next;
}
