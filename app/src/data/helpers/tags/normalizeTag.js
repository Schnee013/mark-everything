export const normalizeTag = (tag={})=>{
    const _id = String(tag._id || tag.name)

    return ({
        _id,
        ...(process.env.ME_LOCAL ? { _meEntity: tag._meEntity } : {}),
        count: tag.count||0,
        query: _id.includes(' ') ? `"#${_id}" ` : `#${_id} `
    })
}